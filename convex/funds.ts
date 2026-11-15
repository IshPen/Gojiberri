import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, mutation, MutationCtx, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { localDate, localTime } from "./time";

// Gauri's cards.ts (#7), referenced by name so this file deploys before it lands.
const issueCard = makeFunctionReference<"mutation", { groupId: Id<"groups"> }, unknown>("cards:issueCard");

export async function createPotForGroup(ctx: MutationCtx, groupId: Id<"groups">, monthlyContribution: number) {
  const existing = await ctx.db
    .query("pots")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .first();
  const potId = existing?._id ?? (await ctx.db.insert("pots", { groupId, balance: 0, monthlyContribution }));
  try {
    await ctx.runMutation(issueCard, { groupId });
  } catch (e) {
    console.warn("Skipped issuing the group card:", String(e));
  }
  return potId;
}

export const createPot = mutation({
  args: { groupId: v.id("groups"), monthlyContribution: v.number() },
  handler: async (ctx, { groupId, monthlyContribution }) => {
    if (!(await ctx.db.get("groups", groupId))) throw new ConvexError("Group not found");
    if (monthlyContribution < 0) throw new ConvexError("Monthly contribution can't be negative");
    return await createPotForGroup(ctx, groupId, monthlyContribution);
  },
});

export const getPot = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const pot = await ctx.db
      .query("pots")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .first();
    if (!pot) return null;
    const monthStart = localTime(`${localDate(Date.now()).slice(0, 8)}01`, 0);
    const paid = new Set<Id<"users">>();
    const transactions = [];
    for await (const t of ctx.db
      .query("transactions")
      .withIndex("by_pot", (q) => q.eq("potId", pot._id))
      .order("desc")) {
      if (transactions.length >= 50 && t._creationTime < monthStart) break;
      if (transactions.length < 50) transactions.push(t);
      if (t._creationTime >= monthStart && t.type === "contribution" && t.status === "completed" && t.userId) {
        paid.add(t.userId);
      }
    }
    return {
      potId: pot._id,
      balance: pot.balance,
      monthlyContribution: pot.monthlyContribution,
      paidThisMonth: [...paid],
      transactions,
    };
  },
});

export const recordContribution = internalMutation({
  args: { potId: v.id("pots"), userId: v.id("users"), amount: v.number(), whopPaymentId: v.string() },
  handler: async (ctx, { potId, userId, amount, whopPaymentId }) => {
    const pot = await ctx.db.get("pots", potId);
    if (!pot) throw new ConvexError("Pot not found");
    if (!(amount > 0)) throw new ConvexError("Contribution must be more than $0");
    for await (const t of ctx.db.query("transactions").withIndex("by_pot", (q) => q.eq("potId", potId))) {
      if (t.whopPaymentId === whopPaymentId) return t._id;
    }
    const transactionId = await ctx.db.insert("transactions", {
      potId,
      type: "contribution",
      amount,
      userId,
      whopPaymentId,
      status: "completed",
    });
    await ctx.db.patch("pots", potId, { balance: pot.balance + amount });
    return transactionId;
  },
});

export const spend = internalMutation({
  args: { potId: v.id("pots"), amount: v.number(), experienceId: v.id("experiences"), planId: v.id("plans") },
  handler: async (ctx, { potId, amount, experienceId, planId }) => {
    const [pot, experience] = await Promise.all([ctx.db.get("pots", potId), ctx.db.get("experiences", experienceId)]);
    if (!pot) throw new ConvexError("Pot not found");
    if (!experience) throw new ConvexError("Experience not found");
    const business = await ctx.db.get("businesses", experience.businessId);
    if (!business) throw new ConvexError("Business not found");
    if (!(amount > 0)) throw new ConvexError("Spend must be more than $0");
    if (pot.balance < amount) {
      throw new ConvexError(`Not enough in the pot: $${pot.balance} available, $${amount} needed`);
    }
    const transactionId = await ctx.db.insert("transactions", {
      potId,
      type: "spend",
      amount,
      experienceId,
      planId,
      status: "completed",
    });
    await ctx.db.patch("pots", potId, { balance: pot.balance - amount });
    await ctx.db.patch("businesses", business._id, { earned: business.earned + amount });
    return transactionId;
  },
});
