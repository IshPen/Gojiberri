import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { addDollars } from "./funds";

export const businessStats = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const business = await ctx.db.get("businesses", businessId);
    if (!business) throw new ConvexError("Business not found");
    const experiences = await ctx.db
      .query("experiences")
      .withIndex("by_business", (q) => q.eq("businessId", businessId))
      .collect();
    const titles = new Map<Id<"experiences">, string>(experiences.map((e) => [e._id, e.title]));
    const sales: Doc<"transactions">[] = [];
    const byPlan = new Map<Id<"plans">, Doc<"transactions">>();
    for (const t of await ctx.db.query("transactions").order("desc").take(2000)) {
      if (t.type !== "spend" || t.status !== "completed" || !t.experienceId || !titles.has(t.experienceId)) continue;
      const sale = t.planId ? byPlan.get(t.planId) : undefined;
      if (sale) {
        sale.amount = addDollars(sale.amount, t.amount);
        continue;
      }
      const row = { ...t };
      if (t.planId) byPlan.set(t.planId, row);
      sales.push(row);
    }
    const recentSales = await Promise.all(
      sales.slice(0, 10).map(async (t) => {
        const pot = await ctx.db.get("pots", t.potId);
        const group = pot ? await ctx.db.get("groups", pot.groupId) : null;
        return {
          transactionId: t._id,
          experience: titles.get(t.experienceId!) ?? "",
          groupName: group?.name ?? "",
          amount: t.amount,
          at: t._creationTime,
        };
      }),
    );
    return { bookings: sales.length, earned: business.earned, recentSales };
  },
});
