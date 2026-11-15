import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// MOCK group card. Whop card issuing isn't verified yet, so issueCard and chargeCard
// keep the real integration's shape and only their internals will change.

// Ishan's funds.ts (I-7), referenced by name so this file deploys on its own.
const spend = makeFunctionReference<
  "mutation",
  { potId: Id<"pots">; amount: number; experienceId: Id<"experiences">; planId: Id<"plans"> },
  unknown
>("funds:spend");

export const issueCard = internalMutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
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

    const experienceId = plan.options[plan.winningIndex]?.experienceId;
    if (!experienceId) throw new Error("The winning option isn't a bookable experience");
    const experience = await ctx.db.get("experiences", experienceId);
    if (!experience) throw new Error("Experience not found");

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

    const ledger = await ctx.db
      .query("transactions")
      .withIndex("by_pot", (q) => q.eq("potId", pot._id))
      .collect();
    if (ledger.some((t) => t.type === "spend" && t.planId === planId && t.status !== "failed")) {
      throw new Error("This plan is already paid");
    }

    const confirmed = (
      await ctx.db
        .query("votes")
        .withIndex("by_plan", (q) => q.eq("planId", planId))
        .collect()
    ).filter((vote) => vote.confirmed).length;
    if (confirmed < group.memberIds.length && Date.now() < plan.confirmBy) {
      throw new Error("Wait until everyone confirms or the confirm deadline passes");
    }
    if (confirmed < experience.minGroup || confirmed > experience.maxGroup) {
      throw new Error(`${experience.title} needs ${experience.minGroup}-${experience.maxGroup} people, ${confirmed} confirmed`);
    }
    const amount = experience.pricePerPerson * confirmed;

    const spent = await ctx.runMutation(spend, { potId: pot._id, amount, experienceId, planId });
    const transactionId =
      typeof spent === "string"
        ? (spent as Id<"transactions">)
        : (
            await ctx.db
              .query("transactions")
              .withIndex("by_pot", (q) => q.eq("potId", pot._id))
              .order("desc")
              .first()
          )!._id;
    await ctx.scheduler.runAfter(0, internal.whop.transferToBusiness, { transactionId });

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
