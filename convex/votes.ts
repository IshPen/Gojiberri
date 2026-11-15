import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { formatWhen, MINUTE } from "./time";
import { isDemoMode, MAX_REGENS } from "./plans";
import { external, scheduleExternal } from "./refs";
import { REJECT_COST, spendGojis } from "./points";

export async function lockPlan(ctx: MutationCtx, plan: Doc<"plans">, winningIndex: number) {
  if (plan.status !== "voting") return;
  const extended = Math.max(plan.confirmBy, Date.now() + 5 * MINUTE);
  const confirmBy = isDemoMode() ? extended : Math.min(extended, plan.window.start);
  await ctx.db.patch("plans", plan._id, { status: "locked", winningIndex, confirmBy });
  await ctx.scheduler.runAfter(0, internal.reminders.scheduleForPlan, { planId: plan._id });
  await ctx.scheduler.runAfter(0, internal.pots.onPlanLocked, { planId: plan._id });
  const group = await ctx.db.get("groups", plan.groupId);
  if (group?.keikiChatId) {
    await scheduleExternal(ctx, external.sendKeikiMessage, {
      chatId: group.keikiChatId,
      text: `Locked! ${plan.options[winningIndex]?.title ?? "Your plan"} ${formatWhen(plan.window.start)}. Confirm in the app: gojiberri://plan/${plan._id}`,
    });
  }
  await ctx.scheduler.runAfter(0, internal.notifications.send, {
    userIds: group?.memberIds ?? [],
    title: "Locked!",
    body: `${plan.options[winningIndex]?.title ?? "Your plan"} is happening. Confirm in the app.`,
    data: { planId: plan._id },
  });
}

export async function upsertVote(
  ctx: MutationCtx,
  userId: Id<"users">,
  planId: Id<"plans">,
  optionIndex: number,
) {
  const plan = await ctx.db.get("plans", planId);
  if (!plan) throw new ConvexError("Plan not found");
  if (plan.status !== "voting") throw new ConvexError("Voting is closed for this plan");
  if (optionIndex < 0 || optionIndex >= plan.options.length) throw new ConvexError("Invalid option");
  const group = await ctx.db.get("groups", plan.groupId);
  if (!group?.memberIds.includes(userId)) throw new ConvexError("You're not in this group");
  if (plan.rejectedBy?.includes(userId)) {
    await ctx.db.patch("plans", planId, { rejectedBy: plan.rejectedBy.filter((id) => id !== userId) });
  }

  const existing = await ctx.db
    .query("votes")
    .withIndex("by_plan_user", (q) => q.eq("planId", planId).eq("userId", userId))
    .unique();
  if (existing) {
    await ctx.db.patch("votes", existing._id, { optionIndex });
  } else {
    await ctx.db.insert("votes", { planId, userId, optionIndex, confirmed: false });
  }

  const votes = await ctx.db
    .query("votes")
    .withIndex("by_plan", (q) => q.eq("planId", planId))
    .take(100);
  const majority = Math.floor(group.memberIds.length / 2) + 1;
  const count = votes.filter((vote) => vote.optionIndex === optionIndex).length;
  if (count >= majority) {
    await lockPlan(ctx, plan, optionIndex);
    return { locked: true };
  }
  return { locked: false };
}

export const castVote = mutation({
  args: { userId: v.id("users"), planId: v.id("plans"), optionIndex: v.number() },
  handler: async (ctx, { userId, planId, optionIndex }) => {
    return await upsertVote(ctx, userId, planId, optionIndex);
  },
});

export const rejectOptions = mutation({
  args: { planId: v.id("plans"), userId: v.id("users") },
  handler: async (ctx, { planId, userId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan) throw new ConvexError("Plan not found");
    const user = await ctx.db.get("users", userId);
    if (!user) throw new ConvexError("User not found");
    const refuse = (reason: "insufficient_gojis" | "maxed" | "not_voting" | "not_member") => ({
      ok: false as const,
      reason,
      balance: user.points,
    });
    if (plan.status !== "voting") return refuse("not_voting");
    const group = await ctx.db.get("groups", plan.groupId);
    if (!group?.memberIds.includes(userId)) return refuse("not_member");
    const regenCount = plan.regenCount ?? 0;
    if (regenCount >= MAX_REGENS) return refuse("maxed");
    const charged = plan.rejectChargedBy?.includes(userId) ?? false;
    if (!charged && user.points < REJECT_COST) return refuse("insufficient_gojis");

    const balance = charged
      ? user.points
      : await spendGojis(ctx, user, "reject_spend", REJECT_COST, { planId, groupId: group._id });
    const gojisSpent = charged ? 0 : REJECT_COST;
    const vote = await ctx.db
      .query("votes")
      .withIndex("by_plan_user", (q) => q.eq("planId", planId).eq("userId", userId))
      .unique();
    if (vote) await ctx.db.delete("votes", vote._id);

    const rejectedBy = [...new Set([...(plan.rejectedBy ?? []), userId])].filter((id) =>
      group.memberIds.includes(id),
    );
    const members = group.memberIds.length;
    const result = { ok: true as const, rejects: rejectedBy.length, members, gojisSpent, balance };
    if (rejectedBy.length * 2 <= members) {
      await ctx.db.patch("plans", planId, {
        rejectedBy,
        rejectChargedBy: charged ? plan.rejectChargedBy : [...(plan.rejectChargedBy ?? []), userId],
      });
      return { ...result, regenerated: false, regenCount, maxed: false, generation: plan.generation ?? 0 };
    }

    const votes = await ctx.db
      .query("votes")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(100);
    for (const old of votes) await ctx.db.delete("votes", old._id);
    const rejectedOptionKeys = [
      ...new Set([...(plan.rejectedOptionKeys ?? []), ...plan.options.map((o) => o.experienceId ?? o.placeId)]),
    ];
    const generation = (plan.generation ?? 0) + 1;
    await ctx.db.patch("plans", planId, {
      status: "generating",
      options: [],
      rejectedBy: [],
      rejectChargedBy: [],
      regenCount: regenCount + 1,
      generation,
      rejectedOptionKeys,
    });
    await ctx.scheduler.runAfter(0, internal.suggest.generateSuggestions, {
      planId,
      generation,
      excludeExperienceIds: rejectedOptionKeys.flatMap((key) => ctx.db.normalizeId("experiences", key) ?? []),
      excludePlaceIds: rejectedOptionKeys.flatMap((key) => ctx.db.normalizeId("places", key) ?? []),
      previousOptions: plan.options,
    });
    await ctx.scheduler.runAfter(0, internal.memory.rememberRejection, {
      groupId: group._id,
      userIds: rejectedBy,
      titles: plan.options.map((o) => o.title),
    });
    return { ...result, regenerated: true, regenCount: regenCount + 1, maxed: regenCount + 1 >= MAX_REGENS, generation };
  },
});

export const confirmAttendance = mutation({
  args: { userId: v.id("users"), planId: v.id("plans") },
  handler: async (ctx, { userId, planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan) throw new ConvexError("Plan not found");
    if (plan.status !== "locked") throw new ConvexError("This plan isn't locked yet");
    const existing = await ctx.db
      .query("votes")
      .withIndex("by_plan_user", (q) => q.eq("planId", planId).eq("userId", userId))
      .unique();
    if (existing?.confirmed) return { awarded: false };
    if (Date.now() > plan.confirmBy) throw new ConvexError("The confirmation deadline has passed");
    if (existing) {
      await ctx.db.patch("votes", existing._id, { confirmed: true });
    } else {
      await ctx.db.insert("votes", {
        planId,
        userId,
        optionIndex: plan.winningIndex ?? 0,
        confirmed: true,
      });
    }
    return { awarded: false };
  },
});
