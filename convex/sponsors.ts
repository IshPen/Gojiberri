import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { fitsBudget } from "./pricing";
import { POINTS_PER_DIAMOND } from "./points";

const MIN_SHARED_TAGS = 2;

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const sponsors = (await ctx.db.query("sponsors").collect()).filter((s) => s.active);
    return await Promise.all(
      sponsors.map(async (s) => ({ ...s, place: await ctx.db.get("places", s.placeId) })),
    );
  },
});

export const pickSponsored = internalQuery({
  args: { budgetMax: v.number(), tags: v.array(v.string()) },
  handler: async (ctx, { budgetMax, tags }) => {
    const wanted = new Set(tags.map((t) => t.toLowerCase()));
    let best = null;
    let bestOverlap = 0;
    for (const sponsor of await ctx.db.query("sponsors").collect()) {
      if (!sponsor.active || !fitsBudget(sponsor.priceLevel, budgetMax)) continue;
      const overlap = sponsor.tags.filter((t) => wanted.has(t.toLowerCase())).length;
      if (overlap >= MIN_SHARED_TAGS && overlap > bestOverlap) {
        best = sponsor;
        bestOverlap = overlap;
      }
    }
    return best;
  },
});

export const redeemReward = mutation({
  args: { userId: v.id("users"), sponsorId: v.id("sponsors") },
  handler: async (ctx, { userId, sponsorId }) => {
    const [user, sponsor] = await Promise.all([ctx.db.get("users", userId), ctx.db.get("sponsors", sponsorId)]);
    if (!user) throw new Error("User not found");
    if (!sponsor || !sponsor.active) throw new Error("This offer is no longer available");
    if (user.diamonds < sponsor.rewardCost) {
      const rewards = (n: number) => `${n} ${n === 1 ? "reward" : "rewards"}`;
      throw new Error(
        `This needs ${rewards(sponsor.rewardCost)} and you have ${user.diamonds} ready. Every ${POINTS_PER_DIAMOND} Gojis unlocks a free reward.`,
      );
    }

    const mine = await ctx.db
      .query("rewards")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    let reward = mine.find((r) => r.sponsorId === sponsorId && r.redeemedAt === undefined);
    if (!reward) {
      const pool = await ctx.db.query("rewards").collect();
      reward = pool.find((r) => r.sponsorId === sponsorId && r.redeemedAt === undefined);
    }

    if (!reward) throw new Error(`${sponsor.business} is out of rewards right now`);

    await ctx.db.patch("rewards", reward._id, { userId, redeemedAt: Date.now() });
    await ctx.db.patch("users", userId, { diamonds: user.diamonds - sponsor.rewardCost });
    return { code: reward.code, offer: sponsor.offer, business: sponsor.business };
  },
});

export const getMyRewards = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rewards = await ctx.db
      .query("rewards")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    return await Promise.all(
      rewards
        .filter((r) => r.redeemedAt !== undefined)
        .sort((a, b) => (b.redeemedAt ?? 0) - (a.redeemedAt ?? 0))
        .map(async (r) => {
          const sponsor = await ctx.db.get("sponsors", r.sponsorId);
          return { ...r, business: sponsor?.business ?? "", offer: sponsor?.offer ?? "" };
        }),
    );
  },
});

export const stats = query({
  args: { sponsorId: v.id("sponsors") },
  handler: async (ctx, { sponsorId }) => {
    const visits = await ctx.db
      .query("visits")
      .withIndex("by_sponsor", (q) => q.eq("sponsorId", sponsorId))
      .collect();
    return { visits: visits.length, earned: visits.reduce((sum, visit) => sum + visit.amount, 0) };
  },
});
