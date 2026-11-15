import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

const AMOUNT_TOLERANCE = 0.005;

export const getPurchase = internalQuery({
  args: { purchaseId: v.id("experiencePurchases") },
  handler: async (ctx, { purchaseId }) => await ctx.db.get("experiencePurchases", purchaseId),
});

export const getMyPurchase = query({
  args: { userId: v.id("users"), experienceId: v.id("experiences") },
  handler: async (ctx, { userId, experienceId }) => {
    const purchases = await ctx.db
      .query("experiencePurchases")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    const latest = purchases.find((p) => p.experienceId === experienceId && p.whopCheckoutId);
    return latest ? { purchaseId: latest._id, status: latest.status, amount: latest.amount, quantity: latest.quantity } : null;
  },
});

export const createPending = internalMutation({
  args: {
    userId: v.id("users"),
    experienceId: v.id("experiences"),
    groupId: v.optional(v.id("groups")),
    quantity: v.number(),
  },
  handler: async (ctx, { userId, experienceId, groupId, quantity }) => {
    if (!Number.isInteger(quantity) || quantity < 1) throw new ConvexError("Quantity must be a whole number of people");
    const [user, experience] = await Promise.all([ctx.db.get("users", userId), ctx.db.get("experiences", experienceId)]);
    if (!user) throw new ConvexError("User not found");
    if (!experience?.active) throw new ConvexError("This experience isn't for sale");
    if (!experience.whopPlanId) throw new ConvexError("This experience isn't on Whop yet");
    if (groupId) {
      const group = await ctx.db.get("groups", groupId);
      if (!group?.memberIds.includes(userId)) throw new ConvexError("Only crew members can buy for this crew");
    }
    const amount = experience.pricePerPerson * quantity;
    if (!Number.isFinite(amount) || amount <= 0) throw new ConvexError("This experience has no valid price");
    return await ctx.db.insert("experiencePurchases", {
      userId,
      experienceId,
      businessId: experience.businessId,
      groupId,
      quantity,
      amount,
      currency: "usd",
      whopPlanId: experience.whopPlanId,
      status: "pending",
    });
  },
});

export const attachCheckout = internalMutation({
  args: { purchaseId: v.id("experiencePurchases"), whopCheckoutId: v.string(), checkoutUrl: v.string() },
  handler: async (ctx, { purchaseId, whopCheckoutId, checkoutUrl }) => {
    const purchase = await ctx.db.get("experiencePurchases", purchaseId);
    if (!purchase) throw new ConvexError("Purchase not found");
    if (purchase.whopCheckoutId && purchase.whopCheckoutId !== whopCheckoutId) {
      throw new ConvexError("Purchase is bound to another checkout");
    }
    await ctx.db.patch("experiencePurchases", purchaseId, { whopCheckoutId, checkoutUrl });
    return null;
  },
});

export const failCheckout = internalMutation({
  args: { purchaseId: v.id("experiencePurchases"), reason: v.string() },
  handler: async (ctx, { purchaseId, reason }) => {
    const purchase = await ctx.db.get("experiencePurchases", purchaseId);
    if (purchase?.status !== "pending" || purchase.whopCheckoutId) return null;
    await ctx.db.patch("experiencePurchases", purchaseId, { status: "failed", failureReason: reason });
    return null;
  },
});

export const markPaid = internalMutation({
  args: {
    purchaseId: v.id("experiencePurchases"),
    whopPaymentId: v.string(),
    amount: v.number(),
    currency: v.string(),
    whopCheckoutId: v.optional(v.string()),
    whopPlanId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const purchase = await ctx.db.get("experiencePurchases", args.purchaseId);
    if (!purchase) return { result: "not_found" as const };

    const paidBefore = await ctx.db
      .query("experiencePurchases")
      .withIndex("by_payment", (q) => q.eq("whopPaymentId", args.whopPaymentId))
      .first();
    if (paidBefore) {
      return paidBefore._id === purchase._id
        ? { result: "duplicate" as const }
        : { result: "conflict" as const, reason: `Payment ${args.whopPaymentId} already completed another purchase` };
    }
    if (purchase.status === "completed") {
      return { result: "conflict" as const, reason: `Purchase already completed by payment ${purchase.whopPaymentId}` };
    }

    if (args.whopPlanId === undefined && args.whopCheckoutId === undefined) {
      return { result: "unbound" as const, reason: "Payment carries no checkout or variant id" };
    }
    const planMatches = args.whopPlanId !== undefined && !!purchase.whopPlanId && args.whopPlanId === purchase.whopPlanId;
    if (args.whopCheckoutId !== undefined && !purchase.whopCheckoutId && !planMatches) {
      return { result: "unbound" as const, reason: "Checkout isn't attached to this purchase yet" };
    }

    let reason: string | null = null;
    if (!Number.isFinite(args.amount) || Math.abs(args.amount - purchase.amount) >= AMOUNT_TOLERANCE) {
      reason = `Paid ${args.amount}, expected ${purchase.amount}`;
    } else if (args.currency.toLowerCase() !== purchase.currency.toLowerCase()) {
      reason = `Paid in ${args.currency}, expected ${purchase.currency}`;
    } else if (args.whopPlanId !== undefined && !planMatches) {
      reason = `Paid variant ${args.whopPlanId}, expected ${purchase.whopPlanId ?? "none"}`;
    } else if (args.whopCheckoutId !== undefined && purchase.whopCheckoutId && args.whopCheckoutId !== purchase.whopCheckoutId) {
      reason = `Paid checkout ${args.whopCheckoutId}, expected ${purchase.whopCheckoutId}`;
    }
    if (reason) {
      await ctx.db.patch("experiencePurchases", purchase._id, { status: "failed", failureReason: reason });
      return { result: "failed" as const, reason };
    }

    await ctx.db.patch("experiencePurchases", purchase._id, {
      status: "completed",
      whopPaymentId: args.whopPaymentId,
      completedAt: Date.now(),
      failureReason: undefined,
      ...(purchase.whopCheckoutId ? {} : args.whopCheckoutId ? { whopCheckoutId: args.whopCheckoutId } : {}),
    });
    const business = await ctx.db.get("businesses", purchase.businessId);
    if (business) await ctx.db.patch("businesses", business._id, { earned: business.earned + purchase.amount });
    return { result: "completed" as const };
  },
});
