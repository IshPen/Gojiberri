import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { isDemoMode } from "./plans";

function requireDemo() {
  if (!isDemoMode()) throw new ConvexError("Demo triggers are disabled (DEMO_MODE=false)");
}
import { internal } from "./_generated/api";
import { external, scheduleExternal } from "./refs";
import { TableNames } from "./_generated/dataModel";

export const sendRatingNow = mutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    requireDemo();
    await ctx.scheduler.runAfter(0, internal.reminders.sendRatingPrompt, { planId });
    return null;
  },
});

export const sendReminderNow = mutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    requireDemo();
    await ctx.scheduler.runAfter(0, internal.reminders.sendReminder, { planId });
    return null;
  },
});

export const dropNow = mutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    requireDemo();
    const plan = await ctx.db.get("plans", planId);
    if (!plan) return null;
    await ctx.db.patch("plans", planId, { confirmBy: Math.min(plan.confirmBy, Date.now()) });
    await ctx.scheduler.runAfter(0, internal.reminders.dropUnconfirmed, { planId });
    return null;
  },
});

export const assignSoloNow = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    requireDemo();
    const quests = await ctx.db
      .query("soloQuests")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);
    for (const quest of quests) {
      if (quest.status === "open") await ctx.db.delete("soloQuests", quest._id);
    }
    const user = await ctx.db.get("users", userId);
    if (user?.lastSoloDate) await ctx.db.patch("users", userId, { lastSoloDate: undefined });
    return await scheduleExternal(ctx, external.pickSoloQuest, { userId });
  },
});

const DEMO_TABLES: TableNames[] = [
  "votes",
  "ratings",
  "photos",
  "visits",
  "rewards",
  "deposits",
  "recurrences",
  "pointEvents",
  "soloQuests",
  "plans",
  "sponsors",
  "groups",
  "places",
  "users",
];

export const resetDemo = mutation({
  args: {},
  handler: async (ctx) => {
    requireDemo();
    for (const table of DEMO_TABLES) {
      for (const doc of await ctx.db.query(table).take(2000)) {
        await ctx.db.delete(table, doc._id);
      }
    }
    const seeded = await scheduleExternal(ctx, external.seedDemo, {});
    return { seeded };
  },
});
