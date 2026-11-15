import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { awardPoints } from "./points";
import { formatWhen, MINUTE } from "./time";
import { external, scheduleExternal } from "./refs";

export async function lockPlan(ctx: MutationCtx, plan: Doc<"plans">, winningIndex: number) {
  const confirmBy = Math.max(plan.confirmBy, Date.now() + 5 * MINUTE);
  await ctx.db.patch("plans", plan._id, { status: "locked", winningIndex, confirmBy });
  await ctx.scheduler.runAfter(0, internal.reminders.scheduleForPlan, { planId: plan._id });
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
    if (Date.now() <= plan.confirmBy) {
      await awardPoints(ctx, userId, "confirm");
      return { awarded: true };
    }
    return { awarded: false };
  },
});
