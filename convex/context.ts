import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Internal reads and writes used by Gauri's "use node" actions
// (memory, suggest, whop, keiki), which cannot touch the database directly.

const TZ = "America/Los_Angeles";

export function dayInPT(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function ptTime(day: string, hour: number): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asPT = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return guess + (guess - asPT);
}

export function formatWindowPT(start: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(start));
}

export const getUser = internalQuery({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => ctx.db.get("users", userId),
});

export const listUserIds = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("users").collect()).map((u) => u._id),
});

export const getPlace = internalQuery({
  args: { placeId: v.id("places") },
  handler: (ctx, { placeId }) => ctx.db.get("places", placeId),
});

export const getSponsor = internalQuery({
  args: { sponsorId: v.id("sponsors") },
  handler: (ctx, { sponsorId }) => ctx.db.get("sponsors", sponsorId),
});

async function loadMembers(ctx: QueryCtx, group: Doc<"groups">) {
  const members = await Promise.all(group.memberIds.map((id) => ctx.db.get("users", id)));
  return members.filter((m): m is Doc<"users"> => m !== null);
}

export const groupWithMembers = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get("groups", groupId);
    if (!group) return null;
    return { group, members: await loadMembers(ctx, group) };
  },
});

export const planContext = internalQuery({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan) throw new Error("Plan not found");
    const group = await ctx.db.get("groups", plan.groupId);
    if (!group) throw new Error("Group not found");
    const members = await loadMembers(ctx, group);

    const pastPlans = await ctx.db
      .query("plans")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const lowRatedPlaceIds = new Set<Id<"places">>();
    for (const past of pastPlans) {
      if (past.winningIndex === undefined) continue;
      const placeId = past.options[past.winningIndex]?.placeId;
      if (!placeId) continue;
      const ratings = await ctx.db
        .query("ratings")
        .withIndex("by_plan", (q) => q.eq("planId", past._id))
        .collect();
      if (ratings.length === 0) continue;
      const avg = ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;
      if (avg <= 2) lowRatedPlaceIds.add(placeId);
    }
    const pot = await ctx.db
      .query("pots")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .first();
    const experiences = (await ctx.db.query("experiences").collect()).filter((e) => e.active);
    return { plan, group, members, lowRatedPlaceIds: [...lowRatedPlaceIds], pot, experiences };
  },
});

export const ratingContext = internalQuery({
  args: { ratingId: v.id("ratings") },
  handler: async (ctx, { ratingId }) => {
    const rating = await ctx.db.get("ratings", ratingId);
    if (!rating) return null;
    const user = await ctx.db.get("users", rating.userId);
    let place: Doc<"places"> | null = null;
    let groupId: Id<"groups"> | undefined;
    if (rating.planId) {
      const plan = await ctx.db.get("plans", rating.planId);
      if (plan) {
        groupId = plan.groupId;
        const option = plan.options[plan.winningIndex ?? 0];
        if (option) place = await ctx.db.get("places", option.placeId);
      }
    }
    return {
      userId: rating.userId,
      userName: user?.name ?? "Someone",
      stars: rating.stars,
      vibe: rating.vibe,
      placeName: place?.name ?? "an outing",
      groupId,
    };
  },
});

export const potForGroup = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const [group, pot] = await Promise.all([
      ctx.db.get("groups", groupId),
      ctx.db
        .query("pots")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .first(),
    ]);
    return group && pot ? { group, pot } : null;
  },
});

// Ishan's funds.ts (I-7), referenced by name so this file deploys on its own.
const recordContribution = makeFunctionReference<
  "mutation",
  { potId: Id<"pots">; userId: Id<"users">; amount: number; whopPaymentId: string },
  unknown
>("funds:recordContribution");

// Dedupe and credit in one transaction, so concurrent webhook retries can't double-count.
export const recordContributionOnce = internalMutation({
  args: { potId: v.id("pots"), userId: v.id("users"), amount: v.number(), whopPaymentId: v.string() },
  handler: async (ctx, args) => {
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_pot", (q) => q.eq("potId", args.potId))
      .collect();
    if (transactions.some((t) => t.whopPaymentId === args.whopPaymentId)) return false;
    await ctx.runMutation(recordContribution, args);
    return true;
  },
});

export const experienceWithBusiness = internalQuery({
  args: { experienceId: v.id("experiences") },
  handler: async (ctx, { experienceId }) => {
    const experience = await ctx.db.get("experiences", experienceId);
    if (!experience) return null;
    return { experience, business: await ctx.db.get("businesses", experience.businessId) };
  },
});

export const saveExperienceWhopIds = internalMutation({
  args: { experienceId: v.id("experiences"), whopProductId: v.string(), whopPlanId: v.string() },
  handler: async (ctx, { experienceId, ...ids }) => {
    await ctx.db.patch("experiences", experienceId, ids);
  },
});

export const transferContext = internalQuery({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, { transactionId }) => {
    const transaction = await ctx.db.get("transactions", transactionId);
    if (!transaction?.experienceId) return null;
    const experience = await ctx.db.get("experiences", transaction.experienceId);
    const business = experience ? await ctx.db.get("businesses", experience.businessId) : null;
    return { transaction, business };
  },
});

export const noteTransaction = internalMutation({
  args: { transactionId: v.id("transactions"), note: v.string() },
  handler: async (ctx, { transactionId, note }) => {
    await ctx.db.patch("transactions", transactionId, { note });
  },
});

export const groupByChat = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    const groups = await ctx.db.query("groups").collect();
    const group = groups.find((g) => g.keikiChatId === chatId);
    if (!group) return null;
    return { group, members: await loadMembers(ctx, group) };
  },
});

export const linkChat = internalMutation({
  args: { chatId: v.string(), inviteCode: v.string() },
  handler: async (ctx, { chatId, inviteCode }) => {
    const group = await ctx.db
      .query("groups")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode.toUpperCase()))
      .first();
    if (!group) return null;
    await ctx.db.patch("groups", group._id, { keikiChatId: chatId });
    return group.name;
  },
});

export const planSummary = internalQuery({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan) return null;
    const group = await ctx.db.get("groups", plan.groupId);
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .collect();
    const counts = plan.options.map((_, i) => votes.filter((vote) => vote.optionIndex === i).length);
    return { plan, counts, keikiChatId: group?.keikiChatId ?? null };
  },
});

export const latestOpenPlan = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const plans = await ctx.db
      .query("plans")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .order("desc")
      .collect();
    return plans.find((p) => p.status === "voting" || p.status === "locked" || p.status === "generating") ?? null;
  },
});
