import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { insertPlan } from "./plans";
import { addDays, DAY, localDate, localTime, weekday } from "./time";

const RULE = "first-friday-monthly";

function firstFridayOnOrAfter(now: number): string {
  let [year, month] = localDate(now).split("-").map(Number);
  for (;;) {
    let date = `${year}-${String(month).padStart(2, "0")}-01`;
    while (weekday(date) !== 5) date = addDays(date, 1);
    if (localTime(date, 18) > now) return date;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

function votingOpensFor(date: string) {
  return localTime(date, 18) - 7 * DAY;
}

export const setRecurrence = mutation({
  args: { groupId: v.id("groups"), rule: v.string() },
  handler: async (ctx, { groupId, rule }) => {
    if (rule !== RULE) throw new ConvexError(`Only "${RULE}" is supported`);
    const group = await ctx.db.get("groups", groupId);
    if (!group) throw new ConvexError("Group not found");
    const existing = (await ctx.db.query("recurrences").take(500)).find((r) => r.groupId === groupId);
    const nextRun = Math.max(Date.now(), votingOpensFor(firstFridayOnOrAfter(Date.now())));
    if (existing) {
      await ctx.db.patch("recurrences", existing._id, { rule, nextRun, active: true });
      return existing._id;
    }
    return await ctx.db.insert("recurrences", { groupId, rule, nextRun, active: true });
  },
});

export const runDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("recurrences")
      .withIndex("by_nextRun", (q) => q.lte("nextRun", now))
      .take(50);
    for (const recurrence of due) {
      if (!recurrence.active) continue;
      const date = firstFridayOnOrAfter(now);
      await insertPlan(
        ctx,
        recurrence.groupId,
        { start: localTime(date, 18), end: localTime(date, 22) },
        recurrence._id,
      );
      const following = firstFridayOnOrAfter(localTime(date, 23));
      await ctx.db.patch("recurrences", recurrence._id, { nextRun: votingOpensFor(following) });
    }
    return null;
  },
});
