"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const WHOP_API = process.env.WHOP_API_BASE ?? "https://sandbox-api.whop.com/api/v1";

async function whopPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WHOP_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
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
        account_id: process.env.WHOP_COMPANY_ID,
        product_id: process.env.WHOP_PRODUCT_ID,
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
        account_id: process.env.WHOP_COMPANY_ID,
        product_id: process.env.WHOP_PRODUCT_ID,
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
        account_id: process.env.WHOP_COMPANY_ID,
        title: experience.title.slice(0, 80),
        description: `${experience.description} Hosted by ${business?.name ?? "a local business"}.`.slice(0, 1500),
        metadata: { experienceId },
      });
      const plan = await whopPost<{ id: string }>("/variants", {
        account_id: process.env.WHOP_COMPANY_ID,
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
        origin_id: process.env.WHOP_COMPANY_ID,
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
    const payment = event?.data;
    const metadata: Record<string, string> = payment?.metadata ?? {};
    console.log(`Whop event ${event?.type}`, metadata);
    if (event?.type !== "payment.succeeded" || metadata.kind !== "contribution") return null;

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
