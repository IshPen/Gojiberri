import { v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { external, scheduleExternal } from "./refs";

export const submitRating = mutation({
  args: {
    userId: v.id("users"),
    planId: v.id("plans"),
    stars: v.number(),
    vibe: v.string(),
  },
  handler: async (ctx, { userId, planId, stars, vibe }) => {
    const clamped = Math.min(5, Math.max(1, Math.round(stars)));
    const word = vibe.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const candidates = await ctx.db
      .query("ratings")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(200);
    const existing = candidates.find((r) => r.userId === userId);
    let ratingId;
    if (existing) {
      await ctx.db.patch("ratings", existing._id, { stars: clamped, vibe: word });
      ratingId = existing._id;
    } else {
      ratingId = await ctx.db.insert("ratings", { userId, planId, stars: clamped, vibe: word });
    }
    await scheduleExternal(ctx, external.rememberRating, { ratingId });
    await ctx.scheduler.runAfter(0, internal.taste.rebuild, { userId, planId });
    return ratingId;
  },
});

export const getDetails = internalQuery({
  args: { ratingId: v.id("ratings") },
  handler: async (ctx, { ratingId }) => {
    const rating = await ctx.db.get("ratings", ratingId);
    if (!rating) return null;
    let placeId = null;
    let groupId = null;
    if (rating.planId) {
      const plan = await ctx.db.get("plans", rating.planId);
      if (plan && plan.winningIndex !== undefined) placeId = plan.options[plan.winningIndex]?.placeId ?? null;
      groupId = plan?.groupId ?? null;
    }
    const place = placeId ? await ctx.db.get("places", placeId) : null;
    return { rating, place, groupId };
  },
});
