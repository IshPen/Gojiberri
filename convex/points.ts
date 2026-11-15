import { v } from "convex/values";
import { internalMutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

export const POINTS = { checkin: 50, solo: 25, confirm: 15, rate: 10 } as const;
export const POINTS_PER_DIAMOND = 500;

const reasonValidator = v.union(
  v.literal("checkin"),
  v.literal("solo"),
  v.literal("confirm"),
  v.literal("rate"),
);

export async function awardPoints(
  ctx: MutationCtx,
  userId: Id<"users">,
  reason: keyof typeof POINTS,
) {
  const user = await ctx.db.get("users", userId);
  if (!user) throw new Error("User not found");
  const points = POINTS[reason];
  const total = user.points + points;
  const newDiamonds =
    Math.floor(total / POINTS_PER_DIAMOND) - Math.floor(user.points / POINTS_PER_DIAMOND);
  await ctx.db.patch("users", userId, { points: total, diamonds: user.diamonds + newDiamonds });
  await ctx.db.insert("pointEvents", { userId, reason, points });
  return { points: total, diamondsEarned: newDiamonds };
}

export const award = internalMutation({
  args: { userId: v.id("users"), reason: reasonValidator },
  handler: async (ctx, { userId, reason }) => {
    return await awardPoints(ctx, userId, reason);
  },
});

export const leaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_points")
      .order("desc")
      .take(Math.min(limit ?? 20, 100));
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      points: u.points,
      diamonds: u.diamonds,
      streak: u.streak,
    }));
  },
});

export const weeklyPrizes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const top = await ctx.db.query("users").withIndex("by_points").order("desc").take(3);
    for (const user of top) {
      await ctx.db.patch("users", user._id, { diamonds: user.diamonds + 1 });
    }
    if (top.length > 0) {
      await ctx.scheduler.runAfter(0, internal.notifications.send, {
        userIds: top.map((u) => u._id),
        title: "Weekly leaderboard prize",
        body: "You finished top 3 this week. +1 diamond!",
        data: { screen: "leaderboard" },
      });
    }
    return null;
  },
});
