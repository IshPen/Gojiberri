import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { debitShares, loadPlanSplit } from "./funds";

// MOCK group card. Whop card issuing isn't verified yet, so issueCard and chargeCard
// keep the real integration's shape and only their internals will change.

export const issueCard = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    if (!(await ctx.db.get("groups", groupId))) throw new Error("Group not found");
    const existing = await ctx.db
      .query("cards")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .first();
    if (existing) return existing._id;
    const last4 = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
    return await ctx.db.insert("cards", { groupId, last4, status: "mock-active" });
  },
});

export const getCard = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const [group, card, pot] = await Promise.all([
      ctx.db.get("groups", groupId),
      ctx.db
        .query("cards")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .first(),
      ctx.db
        .query("pots")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .first(),
    ]);
    if (!group || !card) return null;
    return { card, groupName: group.name, limit: pot?.balance ?? 0 };
  },
});

export const chargeCard = mutation({
  args: { userId: v.id("users"), groupId: v.id("groups"), planId: v.id("plans") },
  handler: async (ctx, { userId, groupId, planId }) => {
    const [group, plan] = await Promise.all([ctx.db.get("groups", groupId), ctx.db.get("plans", planId)]);
    if (!group || !group.memberIds.includes(userId)) throw new Error("Only group members can use the card");
    if (!plan || plan.groupId !== groupId) throw new Error("Plan not found");
    if (plan.status !== "locked" || plan.winningIndex === undefined) throw new Error("Lock the plan before paying");

    const loaded = await loadPlanSplit(ctx, planId);
    if (!loaded) throw new Error("The winning option isn't a bookable experience");
    const { experience, split } = loaded;

    const [card, pot] = await Promise.all([
      ctx.db
        .query("cards")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .first(),
      ctx.db
        .query("pots")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .first(),
    ]);
    if (!card || card.status === "frozen") throw new Error("The group card isn't active");
    if (!pot) throw new Error("This group doesn't have a fund yet");
    if (split.charged) throw new Error("This plan is already paid");

    const confirmed = split.attendees.length;
    if (confirmed < group.memberIds.length && Date.now() < plan.confirmBy) {
      throw new Error("Wait until everyone confirms or the confirm deadline passes");
    }
    if (confirmed < experience.minGroup || confirmed > experience.maxGroup) {
      throw new Error(`${experience.title} needs ${experience.minGroup}-${experience.maxGroup} people, ${confirmed} confirmed`);
    }
    const short = split.attendees.filter((a) => a.shortBy > 0);
    if (short.length > 0) {
      throw new ConvexError({
        code: "ATTENDEES_SHORT",
        attendees: short.map(({ userId, name, shortBy }) => ({ userId, name, shortBy })),
      });
    }
    const amount = split.total;

    const transactionIds = await debitShares(ctx, { pot, experience, planId, split });
    for (const transactionId of transactionIds) {
      await ctx.scheduler.runAfter(0, internal.whop.transferToBusiness, { transactionId });
    }
    const transactionId = transactionIds[0];

    const [business, updatedPot] = await Promise.all([
      ctx.db.get("businesses", experience.businessId),
      ctx.db.get("pots", pot._id),
    ]);
    return {
      transactionId,
      amount,
      people: confirmed,
      experience: experience.title,
      business: business?.name ?? "",
      last4: card.last4,
      balance: updatedPot?.balance ?? pot.balance - amount,
    };
  },
});
