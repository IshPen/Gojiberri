import { v } from "convex/values";
import { env, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

function checkoutUrl(token: string) {
  if (env.WHOP_MOCK !== "true") throw new Error("Whop demo mode is disabled");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid demo checkout token");
  return `${env.CONVEX_SITE_URL}/whop/mock-checkout?token=${token}`;
}

export const createContribution = internalMutation({
  args: { token: v.string(), userId: v.id("users"), groupId: v.id("groups"), amount: v.number() },
  handler: async (ctx, { token, userId, groupId, amount }) => {
    const url = checkoutUrl(token);
    const cents = Math.round(amount * 100);
    if (!Number.isSafeInteger(cents) || cents < 1 || Math.abs(amount * 100 - cents) > 1e-6) {
      throw new Error("Enter a valid contribution in dollars and cents");
    }
    const group = await ctx.db.get("groups", groupId);
    if (!group?.memberIds.includes(userId) || !(await ctx.db.get("users", userId))) {
      throw new Error("Only crew members can contribute");
    }
    const pot = await ctx.db.query("pots").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique();
    if (!pot) throw new Error("This group doesn't have a fund yet");
    if (await ctx.db.query("whopMockCheckouts").withIndex("by_token", (q) => q.eq("token", token)).unique()) {
      throw new Error("Demo checkout token already exists");
    }
    await ctx.db.insert("whopMockCheckouts", {
      token, kind: "contribution", userId, potId: pot._id, amount: cents / 100,
      currency: "usd", title: `${group.name} fun fund`, status: "pending", expiresAt: Date.now() + 30 * 60 * 1000,
    });
    return url;
  },
});

export const createExperience = internalMutation({
  args: { token: v.string(), purchaseId: v.id("experiencePurchases") },
  handler: async (ctx, { token, purchaseId }) => {
    const url = checkoutUrl(token);
    const purchase = await ctx.db.get("experiencePurchases", purchaseId);
    if (!purchase || purchase.status !== "pending" || purchase.whopCheckoutId || !purchase.whopPlanId) {
      throw new Error("Purchase is not available for demo checkout");
    }
    const business = await ctx.db.get("businesses", purchase.businessId);
    if (!business) throw new Error("Business not found");
    if (await ctx.db.query("whopMockCheckouts").withIndex("by_token", (q) => q.eq("token", token)).unique()) {
      throw new Error("Demo checkout token already exists");
    }
    await ctx.db.insert("whopMockCheckouts", {
      token, kind: "experience", userId: purchase.userId, purchaseId,
      amount: purchase.amount, currency: purchase.currency, title: business.name,
      status: "pending", expiresAt: Date.now() + 30 * 60 * 1000,
    });
    await ctx.runMutation(internal.purchases.attachCheckout, {
      purchaseId, whopCheckoutId: `ch_mock_${token}`, checkoutUrl: url,
    });
    return url;
  },
});

export const getCheckout = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (env.WHOP_MOCK !== "true") return null;
    return await ctx.db.query("whopMockCheckouts").withIndex("by_token", (q) => q.eq("token", token)).unique();
  },
});

export const pay = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (env.WHOP_MOCK !== "true") return null;
    const checkout = await ctx.db.query("whopMockCheckouts").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (!checkout) return null;
    if (checkout.status === "paid") return checkout;
    if (checkout.expiresAt <= Date.now()) throw new Error("Demo checkout expired");
    const whopPaymentId = `mock_pay_${token}`;
    if (checkout.kind === "contribution") {
      if (!checkout.potId || checkout.purchaseId) throw new Error("Invalid demo contribution");
      const pot = await ctx.db.get("pots", checkout.potId);
      const group = pot ? await ctx.db.get("groups", pot.groupId) : null;
      if (!pot || !group?.memberIds.includes(checkout.userId) || !(await ctx.db.get("users", checkout.userId))) {
        throw new Error("Contribution is no longer available");
      }
      const balanceCents = Math.round(pot.balance * 100);
      const amountCents = Math.round(checkout.amount * 100);
      if (!Number.isSafeInteger(balanceCents + amountCents) || balanceCents < 0) {
        throw new Error("Fund balance is not valid");
      }
      await ctx.runMutation(internal.context.recordContributionOnce, {
        potId: pot._id, userId: checkout.userId, amount: checkout.amount, whopPaymentId,
      });
    } else {
      if (!checkout.purchaseId || checkout.potId) throw new Error("Invalid demo purchase");
      const purchase = await ctx.db.get("experiencePurchases", checkout.purchaseId);
      if (!purchase || purchase.userId !== checkout.userId || purchase.amount !== checkout.amount ||
        purchase.currency !== checkout.currency || purchase.whopCheckoutId !== `ch_mock_${token}` || !purchase.whopPlanId) {
        throw new Error("Demo purchase binding does not match");
      }
      const result = await ctx.runMutation(internal.purchases.markPaid, {
        purchaseId: purchase._id, whopPaymentId, amount: purchase.amount, currency: purchase.currency,
        whopCheckoutId: purchase.whopCheckoutId, whopPlanId: purchase.whopPlanId,
      });
      if (result.result !== "completed" && result.result !== "duplicate") throw new Error("Demo purchase could not complete");
    }
    const paidAt = Date.now();
    await ctx.db.patch("whopMockCheckouts", checkout._id, { status: "paid", paidAt });
    return { ...checkout, status: "paid" as const, paidAt };
  },
});
