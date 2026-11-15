import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
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

type Ledger = Doc<"transactions">[];

const toCents = (dollars: number) => Math.round(dollars * 100);

function shareCents(ledger: Ledger, userId: Id<"users">) {
  let contributed = 0;
  let spent = 0;
  for (const t of ledger) {
    if (t.userId !== userId || t.status !== "completed") continue;
    if (t.type === "contribution") contributed += toCents(t.amount);
    if (t.type === "spend") spent += toCents(t.amount);
  }
  return { contributed, spent };
}

async function potLedger(ctx: QueryCtx, potId: Id<"pots">) {
  return await ctx.db
    .query("transactions")
    .withIndex("by_pot", (q) => q.eq("potId", potId))
    .collect();
}

export const getPotShares = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const [group, pot] = await Promise.all([
      ctx.db.get("groups", groupId),
      ctx.db
        .query("pots")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .first(),
    ]);
    if (!group) return [];
    const ledger = pot ? await potLedger(ctx, pot._id) : [];
    return await Promise.all(
      group.memberIds.map(async (userId) => {
        const { contributed, spent } = shareCents(ledger, userId);
        const user = await ctx.db.get("users", userId);
        return {
          userId,
          name: user?.name ?? "",
          contributed: contributed / 100,
          spent: spent / 100,
          balance: (contributed - spent) / 100,
        };
      }),
    );
  },
});

export async function loadPlanSplit(ctx: QueryCtx, planId: Id<"plans">) {
  const plan = await ctx.db.get("plans", planId);
  if (!plan || plan.winningIndex === undefined) return null;
  const experienceId = plan.options[plan.winningIndex]?.experienceId;
  if (!experienceId) return null;
  const [group, experience, pot, votes] = await Promise.all([
    ctx.db.get("groups", plan.groupId),
    ctx.db.get("experiences", experienceId),
    ctx.db
      .query("pots")
      .withIndex("by_group", (q) => q.eq("groupId", plan.groupId))
      .first(),
    ctx.db
      .query("votes")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .collect(),
  ]);
  if (!group || !experience) return null;
  const ledger = pot ? await potLedger(ctx, pot._id) : [];

  const confirmed = new Set(votes.filter((vote) => vote.confirmed).map((vote) => vote.userId));
  const attendeeIds = group.memberIds.filter((userId) => confirmed.has(userId));
  const totalCents = toCents(experience.pricePerPerson) * attendeeIds.length;
  const sponsorCents = Math.min(
    totalCents,
    ledger
      .filter((t) => t.type === "contribution" && t.status === "completed" && t.planId === planId && !t.userId)
      .reduce((sum, t) => sum + toCents(t.amount), 0),
  );
  const netCents = totalCents - sponsorCents;
  const n = attendeeIds.length;
  const baseCents = n ? Math.floor(netCents / n) : 0;
  const extraCents = n ? netCents % n : 0;
  const charged = ledger.some((t) => t.type === "spend" && t.planId === planId && t.status !== "failed");

  const attendees = await Promise.all(
    attendeeIds.map(async (userId, i) => {
      const { contributed, spent } = shareCents(ledger, userId);
      const share = baseCents + (i < extraCents ? 1 : 0);
      const balance = contributed - spent;
      const user = await ctx.db.get("users", userId);
      return {
        userId,
        name: user?.name ?? "",
        balance: balance / 100,
        share: share / 100,
        shortBy: charged ? 0 : Math.max(0, share - balance) / 100,
      };
    }),
  );
  return {
    plan,
    experience,
    pot,
    split: {
      experienceId,
      total: totalCents / 100,
      sponsorCredit: sponsorCents / 100,
      perPerson: (baseCents + (extraCents ? 1 : 0)) / 100,
      attendees,
      allCovered: n > 0 && attendees.every((a) => a.shortBy === 0),
      charged,
    },
  };
}

export const getPlanSplit = query({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => (await loadPlanSplit(ctx, planId))?.split ?? null,
});

export async function debitShares(
  ctx: MutationCtx,
  {
    pot,
    experience,
    planId,
    split,
  }: {
    pot: Doc<"pots">;
    experience: Doc<"experiences">;
    planId: Id<"plans">;
    split: { total: number; sponsorCredit: number; attendees: { userId: Id<"users">; share: number }[] };
  },
) {
  const business = await ctx.db.get("businesses", experience.businessId);
  if (!business) throw new ConvexError("Business not found");
  if (!(split.total > 0)) throw new ConvexError("Spend must be more than $0");
  if (toCents(pot.balance) < toCents(split.total)) {
    throw new ConvexError(`Not enough in the pot: $${pot.balance} available, $${split.total} needed`);
  }
  const rows: { amount: number; userId?: Id<"users">; note?: string }[] = [
    ...split.attendees.map(({ userId, share }) => ({ amount: share, userId })),
    { amount: split.sponsorCredit, note: "sponsor credit" },
  ];
  const transactionIds: Id<"transactions">[] = [];
  for (const row of rows) {
    if (!(row.amount > 0)) continue;
    transactionIds.push(
      await ctx.db.insert("transactions", {
        potId: pot._id,
        type: "spend",
        experienceId: experience._id,
        planId,
        status: "completed",
        ...row,
      }),
    );
  }
  await ctx.db.patch("pots", pot._id, { balance: (toCents(pot.balance) - toCents(split.total)) / 100 });
  await ctx.db.patch("businesses", business._id, { earned: business.earned + split.total });
  return transactionIds;
}
