"use node";

import { v } from "convex/values";
import { action, env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const WHOP_API = env.WHOP_API_BASE ?? "https://sandbox-api.whop.com/api/v1";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function usdCents(value: unknown): number | null {
  const money = object(value);
  if (money?.currency !== "usd" || typeof money.amount !== "string") return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(money.amount);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

async function whopPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WHOP_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHOP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Whop ${path} failed (${res.status}): ${text}`);
  return JSON.parse(text) as T;
}

export const createContributionCheckout = action({
  args: { userId: v.id("users"), groupId: v.id("groups"), amount: v.number() },
  handler: async (ctx, { userId, groupId, amount }): Promise<string> => {
    if (amount < 1) throw new Error("Chip in at least $1");
    const found = await ctx.runQuery(internal.context.potForGroup, { groupId });
    if (!found) throw new Error("This group doesn't have a fund yet");
    const config = await whopPost<{ purchase_url: string | null }>("/checkout_configurations", {
      mode: "payment",
      metadata: { kind: "contribution", potId: found.pot._id, userId, amount: String(amount) },
      variant: {
        account_id: env.WHOP_COMPANY_ID,
        product_id: env.WHOP_PRODUCT_ID,
        title: `${found.group.name} fun fund`.slice(0, 30),
        billing_type: "one_time",
        currency: "usd",
        initial_price: amount,
      },
    });
    if (!config.purchase_url) throw new Error("Whop did not return a checkout URL");
    return config.purchase_url;
  },
});

export const createSponsorCheckout = action({
  args: { sponsorId: v.id("sponsors") },
  handler: async (ctx, { sponsorId }): Promise<string> => {
    const sponsor = await ctx.runQuery(internal.context.getSponsor, { sponsorId });
    if (!sponsor) throw new Error("Sponsor not found");
    const config = await whopPost<{ purchase_url: string | null }>("/checkout_configurations", {
      mode: "payment",
      metadata: { kind: "sponsor_pack", sponsorId },
      variant: {
        account_id: env.WHOP_COMPANY_ID,
        product_id: env.WHOP_PRODUCT_ID,
        title: "Sponsored quest pack",
        billing_type: "one_time",
        currency: "usd",
        initial_price: sponsor.payPerVisit * 25,
      },
    });
    if (!config.purchase_url) throw new Error("Whop did not return a checkout URL");
    return config.purchase_url;
  },
});

export const createExperienceProduct = internalAction({
  args: { experienceId: v.id("experiences") },
  handler: async (ctx, { experienceId }): Promise<null> => {
    const found = await ctx.runQuery(internal.context.experienceWithBusiness, { experienceId });
    if (!found) return null;
    const { experience, business } = found;
    try {
      const product = await whopPost<{ id: string }>("/products", {
        account_id: env.WHOP_COMPANY_ID,
        title: experience.title.slice(0, 80),
        description: `${experience.description} Hosted by ${business?.name ?? "a local business"}.`.slice(0, 1500),
        metadata: { experienceId },
      });
      const plan = await whopPost<{ id: string }>("/variants", {
        account_id: env.WHOP_COMPANY_ID,
        product_id: product.id,
        billing_type: "one_time",
        currency: "usd",
        initial_price: experience.pricePerPerson,
        metadata: { experienceId },
      });
      await ctx.runMutation(internal.context.saveExperienceWhopIds, {
        experienceId,
        whopProductId: product.id,
        whopPlanId: plan.id,
      });
    } catch (err) {
      console.warn(`Whop product for ${experience.title} not created`, err);
    }
    return null;
  },
});

export const transferToBusiness = internalAction({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, { transactionId }): Promise<null> => {
    const found = await ctx.runQuery(internal.context.transferContext, { transactionId });
    if (!found) return null;
    const { transaction, business } = found;
    try {
      if (!business?.whopAccountId) throw new Error(`${business?.name ?? "Business"} has no Whop account`);
      const transfer = await whopPost<{ id: string }>("/transfers", {
        type: "balance",
        origin_id: env.WHOP_COMPANY_ID,
        destination_id: business.whopAccountId,
        amount: transaction.amount,
        currency: "usd",
        idempotence_key: transactionId,
        notes: `Gojiberri booking for ${business.name}`,
        metadata: { transactionId },
      });
      await ctx.runMutation(internal.context.noteTransaction, { transactionId, note: `whop transfer ${transfer.id}` });
    } catch (err) {
      console.warn("Whop transfer refused, keeping the ledger entry", err);
      await ctx.runMutation(internal.context.noteTransaction, { transactionId, note: "ledger-only" });
    }
    return null;
  },
});

export const handleEvent = internalAction({
  args: { event: v.any() },
  handler: async (ctx, { event }): Promise<null> => {
    if (object(event)?.type !== "payment.succeeded") return null;
    const payment = object(event.data);
    const metadata = object(payment?.metadata);
    if (!payment || !metadata) return null;

    if (metadata.kind === "experience") {
      if (!env.WHOP_COMPANY_ID) throw new Error("Whop account is not configured");
      if (
        typeof metadata.purchaseId !== "string" || !metadata.purchaseId.trim() ||
        typeof payment.id !== "string" || !/^pay_[A-Za-z0-9]+$/.test(payment.id) ||
        payment.status !== "paid" || payment.substatus !== "succeeded" ||
        payment.currency !== "usd" ||
        payment.account_id !== env.WHOP_COMPANY_ID ||
        (event.account_id !== undefined && event.account_id !== payment.account_id)
      ) {
        console.warn("Whop experience payment rejected: invalid_payment");
        return null;
      }

      const subtotal = usdCents(payment.subtotal);
      const total = usdCents(payment.total);
      const tax = payment.tax_amount === null ? 0 : usdCents(payment.tax_amount);
      if (
        subtotal === null || subtotal <= 0 || total === null || tax === null || tax > total ||
        (tax > 0 && payment.tax_behavior !== "exclusive" && payment.tax_behavior !== "inclusive") ||
        total - (payment.tax_behavior === "exclusive" ? tax : 0) !== subtotal
      ) {
        console.warn("Whop experience payment rejected: invalid_amount");
        return null;
      }

      const checkoutId = payment.checkout_configuration_id;
      const variantId = payment.variant_id;
      if (
        (checkoutId != null && (typeof checkoutId !== "string" || !/^ch_[A-Za-z0-9]+$/.test(checkoutId))) ||
        (variantId != null && (typeof variantId !== "string" || !/^plan_[A-Za-z0-9]+$/.test(variantId)))
      ) {
        console.warn("Whop experience payment rejected: invalid_binding");
        return null;
      }
      if (!checkoutId && !variantId) throw new Error("Whop experience payment is unbound");

      const purchase = await ctx.runQuery(internal.purchases.getPurchase, {
        purchaseId: metadata.purchaseId as Id<"experiencePurchases">,
      });
      if (!purchase) {
        console.warn("Whop experience payment rejected: not_found");
        return null;
      }
      const items = payment.line_items;
      const item = Array.isArray(items) && items.length === 1 ? object(items[0]) : null;
      if (
        !item || !Number.isSafeInteger(item.quantity) || item.quantity !== purchase.quantity ||
        !purchase.whopPlanId || item.variant_id !== purchase.whopPlanId ||
        (variantId != null && variantId !== item.variant_id) || usdCents(item.subtotal) !== subtotal
      ) {
        console.warn("Whop experience payment rejected: invalid_items");
        return null;
      }
      const result = await ctx.runMutation(internal.purchases.markPaid, {
        purchaseId: purchase._id,
        whopPaymentId: payment.id,
        amount: subtotal / 100,
        currency: "usd",
        ...(typeof checkoutId === "string" ? { whopCheckoutId: checkoutId } : {}),
        ...(typeof variantId === "string" ? { whopPlanId: variantId } : {}),
      });
      if (result.result === "unbound") throw new Error("Whop experience payment is unbound");
      if (result.result !== "completed" && result.result !== "duplicate") {
        console.warn(`Whop experience payment rejected: ${result.result}`);
      }
      return null;
    }

    if (metadata.kind !== "contribution") return null;

    const whopPaymentId = String(payment.id);
    const amount = Number(metadata.amount ?? payment.subtotal ?? payment.total);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Payment ${whopPaymentId} has no amount`);
    await ctx.runMutation(internal.context.recordContributionOnce, {
      potId: metadata.potId as Id<"pots">,
      userId: metadata.userId as Id<"users">,
      amount,
      whopPaymentId,
    });
    return null;
  },
});
