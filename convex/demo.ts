import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { isDemoMode } from "./plans";

function requireDemo() {
  if (!isDemoMode()) throw new ConvexError("Demo triggers are disabled (DEMO_MODE=false)");
}
import { internal } from "./_generated/api";
import { external, scheduleExternal } from "./refs";
import { Id, TableNames } from "./_generated/dataModel";

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

export const simulateContribution = mutation({
  args: { groupId: v.id("groups"), userId: v.id("users"), amount: v.number() },
  handler: async (ctx, { groupId, userId, amount }): Promise<{ transactionId: Id<"transactions">; balance: number }> => {
    requireDemo();
    const pot = await ctx.db
      .query("pots")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .first();
    if (!pot) throw new ConvexError("This group doesn't have a fund yet");
    const transactionId: Id<"transactions"> = await ctx.runMutation(internal.funds.recordContribution, {
      potId: pot._id,
      userId,
      amount,
      whopPaymentId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
    return { transactionId, balance: (await ctx.db.get("pots", pot._id))!.balance };
  },
});

const DEMO_TABLES: TableNames[] = [
  "transactions",
  "cards",
  "pots",
  "experiences",
  "businesses",
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
