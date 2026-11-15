import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, env, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { withMembers } from "./groups";
import { external, scheduleExternal } from "./refs";
import { HOUR, MINUTE } from "./time";

const timeBlock = v.object({ start: v.number(), end: v.number() });

export const optionValidator = v.object({
  placeId: v.id("places"),
  title: v.string(),
  costMin: v.number(),
  costMax: v.number(),
  why: v.string(),
  travel: v.optional(v.string()),
  sponsorId: v.optional(v.id("sponsors")),
});

export function isDemoMode() {
  return env.DEMO_MODE !== "false";
}

export async function insertPlan(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  window: { start: number; end: number },
  recurrenceId?: Id<"recurrences">,
) {
  const planId = await ctx.db.insert("plans", {
    groupId,
    window,
    status: "generating",
    options: [],
    confirmBy: window.start,
    recurrenceId,
  });
  await scheduleExternal(ctx, external.generateSuggestions, { planId });
  return planId;
}

export const createPlan = mutation({
  args: { userId: v.id("users"), groupId: v.id("groups"), window: timeBlock },
  handler: async (ctx, { userId, groupId, window }) => {
    const group = await ctx.db.get("groups", groupId);
    if (!group) throw new ConvexError("Group not found");
    if (!group.memberIds.includes(userId)) throw new ConvexError("You're not in this group");
    if (window.end <= window.start) throw new ConvexError("Invalid time window");
    return await insertPlan(ctx, groupId, window);
  },
});

export const saveOptions = internalMutation({
  args: { planId: v.id("plans"), options: v.array(optionValidator) },
  handler: async (ctx, { planId, options }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan || plan.status !== "generating") return null;
    const now = Date.now();
    const confirmBy = isDemoMode()
      ? now + 5 * MINUTE
      : Math.min(
          plan.window.start,
          Math.max(now + 15 * MINUTE, Math.min(now + 24 * HOUR, plan.window.start - 2 * HOUR)),
        );
    await ctx.db.patch("plans", planId, { options, status: "voting", confirmBy });
    const group = await ctx.db.get("groups", plan.groupId);
    await ctx.scheduler.runAfter(0, internal.notifications.send, {
      userIds: group?.memberIds ?? [],
      title: "3 ideas are ready",
      body: `Vote now for ${group?.name ?? "your group"}'s next outing.`,
      data: { planId },
    });
    return null;
  },
});

export async function voteCounts(ctx: QueryCtx, plan: Doc<"plans">) {
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_plan", (q) => q.eq("planId", plan._id))
    .take(100);
  const counts = plan.options.map((_, i) => votes.filter((vote) => vote.optionIndex === i).length);
  return { votes, counts };
}

export const getPlan = query({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan) return null;
    const { votes, counts } = await voteCounts(ctx, plan);
    const places = await Promise.all(plan.options.map((o) => ctx.db.get("places", o.placeId)));
    const group = await ctx.db.get("groups", plan.groupId);
    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(50);
    const full = group ? await withMembers(ctx, group) : null;
    return {
      ...plan,
      votes,
      counts,
      places,
      deposits,
      group: full
        ? { _id: full._id, name: full.name, members: full.members }
        : { _id: plan.groupId, name: "", members: [] },
    };
  },
});

export const getGroupPlans = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .order("desc")
      .take(50);
  },
});

export const getMyUpcomingPlans = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const groups = (await ctx.db.query("groups").take(500)).filter((g) =>
      g.memberIds.includes(userId),
    );
    const result = [];
    for (const group of groups) {
      const plans = await ctx.db
        .query("plans")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .order("desc")
        .take(10);
      for (const plan of plans) {
        if (plan.status !== "voting" && plan.status !== "locked" && plan.status !== "generating") continue;
        result.push({
          ...plan,
          groupName: group.name,
          winner: plan.winningIndex !== undefined ? plan.options[plan.winningIndex] ?? null : null,
        });
      }
    }
    return result.sort((a, b) => a.window.start - b.window.start);
  },
});

export const getContext = internalQuery({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan) return null;
    const group = await ctx.db.get("groups", plan.groupId);
    if (!group) return null;
    const members = (await Promise.all(group.memberIds.map((id) => ctx.db.get("users", id)))).filter(
      (m) => m !== null,
    );
    const pastPlans = await ctx.db
      .query("plans")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .order("desc")
      .take(50);
    const lowRated = new Set<Id<"places">>();
    const recentPlaces = new Set<Id<"places">>();
    for (const past of pastPlans) {
      if (past._id === planId || past.winningIndex === undefined) continue;
      const placeId = past.options[past.winningIndex]?.placeId;
      if (!placeId) continue;
      recentPlaces.add(placeId);
      const ratings = await ctx.db
        .query("ratings")
        .withIndex("by_plan", (q) => q.eq("planId", past._id))
        .take(20);
      if (ratings.length > 0) {
        const avg = ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
        if (avg <= 2) lowRated.add(placeId);
      }
    }
    return {
      plan,
      group,
      members,
      lowRatedPlaceIds: [...lowRated],
      pastPlaceIds: [...recentPlaces],
    };
  },
});

export const getInternal = internalQuery({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    return await ctx.db.get("plans", planId);
  },
});

export const failGeneration = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (plan?.status === "generating") await ctx.db.patch("plans", planId, { status: "cancelled" });
    return null;
  },
});
