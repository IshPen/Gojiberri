import { v } from "convex/values";
import { internalMutation, internalQuery, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Internal reads and writes used by Gauri's "use node" actions
// (memory, suggest, solo, whop, keiki), which cannot touch the database directly.

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
    return { plan, group, members, lowRatedPlaceIds: [...lowRatedPlaceIds] };
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
    } else if (rating.questId) {
      const quest = await ctx.db.get("soloQuests", rating.questId);
      if (quest) place = await ctx.db.get("places", quest.placeId);
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

export const soloContext = internalQuery({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    const existing = await ctx.db
      .query("soloQuests")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();

    const ratings = await ctx.db
      .query("ratings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const ratedPlaceIds = new Set<Id<"places">>();
    for (const r of ratings) {
      if (r.questId) {
        const quest = await ctx.db.get("soloQuests", r.questId);
        if (quest) ratedPlaceIds.add(quest.placeId);
      }
      if (r.planId) {
        const plan = await ctx.db.get("plans", r.planId);
        const option = plan?.options[plan.winningIndex ?? 0];
        if (option) ratedPlaceIds.add(option.placeId);
      }
    }
    return { user, existingQuestId: existing?._id ?? null, ratedPlaceIds: [...ratedPlaceIds] };
  },
});

export const insertSoloQuest = internalMutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    placeId: v.id("places"),
    prompt: v.string(),
    sponsorId: v.optional(v.id("sponsors")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("soloQuests")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("date", args.date))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("soloQuests", { ...args, status: "open" });
  },
});

export const getDeposit = internalQuery({
  args: { depositId: v.id("deposits") },
  handler: (ctx, { depositId }) => ctx.db.get("deposits", depositId),
});

export const findDeposit = internalQuery({
  args: { planId: v.id("plans"), userId: v.id("users") },
  handler: async (ctx, { planId, userId }) => {
    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .collect();
    return deposits.find((d) => d.userId === userId) ?? null;
  },
});

export const reserveDeposit = internalMutation({
  args: { planId: v.id("plans"), userId: v.id("users") },
  handler: async (ctx, { planId, userId }) => {
    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .collect();
    const existing = deposits.find((d) => d.userId === userId);
    if (existing) return existing;
    const depositId = await ctx.db.insert("deposits", { planId, userId, status: "pending" });
    return (await ctx.db.get("deposits", depositId))!;
  },
});

export const markDepositHeld = internalMutation({
  args: { depositId: v.id("deposits"), whopPaymentId: v.string() },
  handler: async (ctx, { depositId, whopPaymentId }) => {
    const deposit = await ctx.db.get("deposits", depositId);
    if (!deposit || deposit.status !== "pending") return { refundNow: false };
    await ctx.db.patch("deposits", depositId, { status: "held", whopPaymentId });
    const photos = await ctx.db
      .query("photos")
      .withIndex("by_plan", (q) => q.eq("planId", deposit.planId))
      .collect();
    return { refundNow: photos.some((p) => p.userId === deposit.userId) };
  },
});

export const updateDeposit = internalMutation({
  args: {
    depositId: v.id("deposits"),
    checkoutUrl: v.optional(v.string()),
    status: v.optional(v.literal("refunded")),
  },
  handler: async (ctx, { depositId, ...patch }) => {
    const fields = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    await ctx.db.patch("deposits", depositId, fields);
  },
});

// Ishan: call from reminders.dropUnconfirmed to forfeit the deposits of dropped users.
export const forfeitDeposits = internalMutation({
  args: { planId: v.id("plans"), userIds: v.array(v.id("users")) },
  handler: async (ctx, { planId, userIds }) => {
    const dropped = new Set(userIds);
    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .collect();
    for (const d of deposits) {
      if (dropped.has(d.userId) && d.status === "held") await ctx.db.patch("deposits", d._id, { status: "forfeited" });
    }
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
