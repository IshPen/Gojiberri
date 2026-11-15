import { ConvexError, v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import { external, scheduleExternal } from "./refs";

export const submitRating = mutation({
  args: {
    userId: v.id("users"),
    planId: v.optional(v.id("plans")),
    questId: v.optional(v.id("soloQuests")),
    stars: v.number(),
    vibe: v.string(),
  },
  handler: async (ctx, { userId, planId, questId, stars, vibe }) => {
    if (!planId === !questId) throw new ConvexError("Rate either a plan or a quest");
    const clamped = Math.min(5, Math.max(1, Math.round(stars)));
    const word = vibe.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const candidates = planId
      ? await ctx.db
          .query("ratings")
          .withIndex("by_plan", (q) => q.eq("planId", planId))
          .take(200)
      : await ctx.db
          .query("ratings")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(5000);
    const existing = candidates.find(
      (r) => r.userId === userId && (planId ? r.planId === planId : r.questId === questId),
    );
    let ratingId;
    if (existing) {
      await ctx.db.patch("ratings", existing._id, { stars: clamped, vibe: word });
      ratingId = existing._id;
    } else {
      ratingId = await ctx.db.insert("ratings", { userId, planId, questId, stars: clamped, vibe: word });
    }
    await scheduleExternal(ctx, external.rememberRating, { ratingId });
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
    } else if (rating.questId) {
      placeId = (await ctx.db.get("soloQuests", rating.questId))?.placeId ?? null;
    }
    const place = placeId ? await ctx.db.get("places", placeId) : null;
    return { rating, place, groupId };
  },
});
