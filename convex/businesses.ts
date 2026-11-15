import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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
    const sales = (await ctx.db.query("transactions").order("desc").take(2000)).filter(
      (t) => t.type === "spend" && t.status === "completed" && t.experienceId && titles.has(t.experienceId),
    );
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
