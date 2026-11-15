import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { addDays, formatWhen, HOUR, localDate, localTime } from "./time";

export const scheduleForPlan = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan || plan.status !== "locked") return null;
    const now = Date.now();
    for (const offset of [24 * HOUR, 2 * HOUR]) {
      const at = plan.window.start - offset;
      if (at > now) await ctx.scheduler.runAt(at, internal.reminders.sendReminder, { planId });
    }
    await ctx.scheduler.runAt(Math.max(plan.confirmBy, now), internal.reminders.dropUnconfirmed, { planId });
    const ratingAt = localTime(addDays(localDate(plan.window.end), 1), 9);
    await ctx.scheduler.runAt(Math.max(ratingAt, now), internal.reminders.sendRatingPrompt, { planId });
    return null;
  },
});

export const sendReminder = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan || plan.status !== "locked" || plan.winningIndex === undefined) return null;
    const group = await ctx.db.get("groups", plan.groupId);
    const option = plan.options[plan.winningIndex];
    await ctx.scheduler.runAfter(0, internal.notifications.send, {
      userIds: group?.memberIds ?? [],
      title: `Coming up: ${option.title}`,
      body: `${formatWhen(plan.window.start)} with ${group?.name ?? "your crew"}. Don't flake!`,
      data: { planId },
    });
    return null;
  },
});

export const dropUnconfirmed = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan || plan.status !== "locked") return null;
    if (Date.now() < plan.confirmBy) {
      await ctx.scheduler.runAt(plan.confirmBy, internal.reminders.dropUnconfirmed, { planId });
      return null;
    }
    const group = await ctx.db.get("groups", plan.groupId);
    if (!group) return null;
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(100);
    const confirmed = new Set(votes.filter((vote) => vote.confirmed).map((vote) => vote.userId));
    const dropped = group.memberIds.filter((id) => !confirmed.has(id));
    if (dropped.length === 0) return null;
    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(100);
    for (const deposit of deposits) {
      if (dropped.includes(deposit.userId) && deposit.status === "held") {
        await ctx.db.patch("deposits", deposit._id, { status: "forfeited" });
      }
    }
    await ctx.scheduler.runAfter(0, internal.notifications.send, {
      userIds: dropped,
      title: "You've been dropped",
      body: `You didn't confirm ${plan.options[plan.winningIndex ?? 0]?.title ?? "the plan"} in time.`,
      data: { planId },
    });
    return null;
  },
});

export const sendRatingPrompt = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan || (plan.status !== "locked" && plan.status !== "done")) return null;
    if (plan.status === "locked") await ctx.db.patch("plans", planId, { status: "done" });
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(100);
    const attendees = votes.filter((vote) => vote.confirmed).map((vote) => vote.userId);
    const group = await ctx.db.get("groups", plan.groupId);
    await ctx.scheduler.runAfter(0, internal.notifications.send, {
      userIds: attendees.length > 0 ? attendees : group?.memberIds ?? [],
      title: "How was it?",
      body: `Rate ${plan.options[plan.winningIndex ?? 0]?.title ?? "your outing"} in one tap.`,
      data: { screen: "rate", targetId: planId, kind: "plan" },
    });
    return null;
  },
});
