"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const WHOP_API = process.env.WHOP_API_BASE ?? "https://sandbox-api.whop.com/api/v1";
const DEPOSIT_AMOUNT = 5;
const SPONSOR_PACK_VISITS = 25;

async function whopFetch<T>(path: string, body: unknown): Promise<T> {
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

async function createCheckout(title: string, price: number, metadata: Record<string, string>): Promise<string> {
  const config = await whopFetch<{ purchase_url: string | null }>("/checkout_configurations", {
    mode: "payment",
    metadata,
    variant: {
      account_id: process.env.WHOP_COMPANY_ID,
      product_id: process.env.WHOP_PRODUCT_ID,
      title,
      billing_type: "one_time",
      currency: "usd",
      initial_price: price,
    },
  });
  if (!config.purchase_url) throw new Error("Whop did not return a checkout URL");
  return config.purchase_url;
}

export const createSponsorCheckout = action({
  args: { sponsorId: v.id("sponsors") },
  handler: async (ctx, { sponsorId }): Promise<string> => {
    const sponsor = await ctx.runQuery(internal.context.getSponsor, { sponsorId });
    if (!sponsor) throw new Error("Sponsor not found");
    return await createCheckout(
      `Sponsored quest pack: ${sponsor.business}`,
      sponsor.payPerVisit * SPONSOR_PACK_VISITS,
      { kind: "sponsor_pack", sponsorId },
    );
  },
});

export const createDeposit = action({
  args: { userId: v.id("users"), planId: v.id("plans") },
  handler: async (ctx, { userId, planId }): Promise<string> => {
    const deposit = await ctx.runMutation(internal.context.reserveDeposit, { planId, userId });
    if (deposit.status !== "pending") throw new Error(`Your deposit for this plan is already ${deposit.status}`);
    if (deposit.checkoutUrl) return deposit.checkoutUrl;

    const checkoutUrl = await createCheckout("Gojiberri $5 flake deposit", DEPOSIT_AMOUNT, {
      kind: "deposit",
      depositId: deposit._id,
    });
    await ctx.runMutation(internal.context.updateDeposit, { depositId: deposit._id, checkoutUrl });
    return checkoutUrl;
  },
});

export const handleEvent = internalAction({
  args: { event: v.any() },
  handler: async (ctx, { event }): Promise<null> => {
    const type: string | undefined = event?.type;
    const payment = event?.data;
    const metadata: Record<string, string> = payment?.metadata ?? {};
    console.log(`Whop event ${type}`, metadata);

    if (type === "payment.succeeded" && metadata.kind === "deposit" && metadata.depositId) {
      const depositId = metadata.depositId as Id<"deposits">;
      const { refundNow } = await ctx.runMutation(internal.context.markDepositHeld, {
        depositId,
        whopPaymentId: payment.id,
      });
      if (refundNow) await ctx.runAction(internal.whop.refundDeposit, { depositId });
    }
    return null;
  },
});

export const refundDeposit = internalAction({
  args: { depositId: v.id("deposits") },
  handler: async (ctx, { depositId }): Promise<null> => {
    const deposit = await ctx.runQuery(internal.context.getDeposit, { depositId });
    if (!deposit || deposit.status !== "held" || !deposit.whopPaymentId) return null;
    await whopFetch(`/payments/${deposit.whopPaymentId}/refund`, {});
    await ctx.runMutation(internal.context.updateDeposit, { depositId, status: "refunded" });
    return null;
  },
});

// Ishan: schedule from photos.savePhoto after a plan check-in.
export const refundForCheckin = internalAction({
  args: { planId: v.id("plans"), userId: v.id("users") },
  handler: async (ctx, { planId, userId }): Promise<null> => {
    const deposit = await ctx.runQuery(internal.context.findDeposit, { planId, userId });
    if (deposit) await ctx.runAction(internal.whop.refundDeposit, { depositId: deposit._id });
    return null;
  },
});
