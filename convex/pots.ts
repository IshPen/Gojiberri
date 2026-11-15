import { ConvexError, v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { addDollars } from "./funds";

const SPONSOR_CHIP_IN = 10;

async function chipIn(
  ctx: MutationCtx,
  { potId, sponsorId, amount, planId }: { potId: Id<"pots">; sponsorId: Id<"sponsors">; amount: number; planId?: Id<"plans"> },
) {
  const [pot, sponsor] = await Promise.all([ctx.db.get("pots", potId), ctx.db.get("sponsors", sponsorId)]);
  if (!pot) throw new ConvexError("Pot not found");
  if (!sponsor) throw new ConvexError("Sponsor not found");
  if (!(amount > 0)) throw new ConvexError("Chip-in must be more than $0");
  const transactionId = await ctx.db.insert("transactions", {
    potId,
    type: "contribution",
    amount,
    planId,
    status: "completed",
    note: sponsor.business,
  });
  await ctx.db.patch("pots", potId, { balance: addDollars(pot.balance, amount) });
  return transactionId;
}

export const addSponsorChipIn = internalMutation({
  args: { potId: v.id("pots"), sponsorId: v.id("sponsors"), amount: v.number(), planId: v.optional(v.id("plans")) },
  handler: async (ctx, args) => await chipIn(ctx, args),
});

export const onPlanLocked = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan || plan.winningIndex === undefined) return null;
    const sponsorId = plan.options[plan.winningIndex]?.sponsorId;
    if (!sponsorId) return null;

    const existing = await ctx.db
      .query("pots")
      .withIndex("by_group", (q) => q.eq("groupId", plan.groupId))
      .first();
    let potId = existing?._id;
    if (!potId) {
      potId = await ctx.db.insert("pots", { groupId: plan.groupId, balance: 0, monthlyContribution: 20 });
      try {
        await ctx.runMutation(api.cards.issueCard, { groupId: plan.groupId });
      } catch (e) {
        console.warn("Skipped issuing the group card:", String(e));
      }
    }

    for await (const t of ctx.db.query("transactions").withIndex("by_pot", (q) => q.eq("potId", potId))) {
      if (t.type === "contribution" && t.planId === planId && !t.userId) return t._id;
    }
    return await chipIn(ctx, { potId, sponsorId, amount: SPONSOR_CHIP_IN, planId });
  },
});
