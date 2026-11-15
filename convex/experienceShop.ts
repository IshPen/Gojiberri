import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

async function partnerCheck(ctx: QueryCtx) {
  const sponsors = (await ctx.db.query("sponsors").take(200)).filter((s) => s.active);
  const names = new Set(sponsors.map((s) => s.business.trim().toLowerCase()));
  const placeIds = new Set(sponsors.map((s) => s.placeId));
  return (business: Doc<"businesses">, experience: Doc<"experiences">) =>
    names.has(business.name.trim().toLowerCase()) || (!!experience.placeId && placeIds.has(experience.placeId));
}

export const listForSale = query({
  args: {},
  handler: async (ctx) => {
    const [experiences, isPartner] = await Promise.all([ctx.db.query("experiences").take(500), partnerCheck(ctx)]);
    const rows = await Promise.all(
      experiences
        .filter((e) => e.active)
        .map(async (e) => {
          const [business, place] = await Promise.all([
            ctx.db.get("businesses", e.businessId),
            e.placeId ? ctx.db.get("places", e.placeId) : null,
          ]);
          if (!business) return null;
          return {
            _id: e._id,
            title: e.title,
            pricePerPerson: e.pricePerPerson,
            minGroup: e.minGroup,
            maxGroup: e.maxGroup,
            tags: e.tags,
            imageUrl: e.imageUrl ?? null,
            businessName: business.name,
            area: place?.area ?? null,
            category: place?.category ?? null,
            partner: isPartner(business, e),
          };
        }),
    );
    return rows
      .filter((r) => r !== null)
      .sort((a, b) => Number(b.partner) - Number(a.partner) || a.pricePerPerson - b.pricePerPerson);
  },
});

export const getForPurchase = query({
  args: { experienceId: v.id("experiences"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { experienceId, userId }) => {
    const experience = await ctx.db.get("experiences", experienceId);
    if (!experience) return null;
    const [business, place, isPartner] = await Promise.all([
      ctx.db.get("businesses", experience.businessId),
      experience.placeId ? ctx.db.get("places", experience.placeId) : null,
      partnerCheck(ctx),
    ]);
    if (!business) return null;

    const groups = userId
      ? (await ctx.db.query("groups").order("desc").take(500)).filter((g) => g.memberIds.includes(userId))
      : [];
    const crews = await Promise.all(
      groups.map(async (group) => {
        const pot = await ctx.db
          .query("pots")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .first();
        const paidPlans = new Set<Id<"plans">>();
        if (pot) {
          for await (const t of ctx.db.query("transactions").withIndex("by_pot", (q) => q.eq("potId", pot._id))) {
            if (t.type === "spend" && t.planId && t.status !== "failed") paidPlans.add(t.planId);
          }
        }
        const plans = await ctx.db
          .query("plans")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .order("desc")
          .take(50);
        const lockedPlan = plans.find(
          (p) =>
            p.status === "locked" &&
            p.winningIndex !== undefined &&
            p.options[p.winningIndex]?.experienceId === experienceId &&
            !paidPlans.has(p._id),
        );
        return {
          groupId: group._id,
          name: group.name,
          memberCount: group.memberIds.length,
          potBalance: pot ? pot.balance : null,
          lockedPlanId: lockedPlan?._id ?? null,
        };
      }),
    );

    return {
      _id: experience._id,
      title: experience.title,
      description: experience.description,
      pricePerPerson: experience.pricePerPerson,
      minGroup: experience.minGroup,
      maxGroup: experience.maxGroup,
      tags: experience.tags,
      imageUrl: experience.imageUrl ?? null,
      active: experience.active,
      onWhop: !!experience.whopPlanId,
      businessName: business.name,
      placeName: place?.name ?? null,
      area: place?.area ?? null,
      category: place?.category ?? null,
      partner: isPartner(business, experience),
      crews,
    };
  },
});
