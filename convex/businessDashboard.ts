import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const nameKey = (name: string) => name.trim().toLowerCase();

async function sponsorChipIns(ctx: QueryCtx, sponsor: Doc<"sponsors">, transactions: Doc<"transactions">[]) {
  const pots = new Set<Id<"pots">>();
  let total = 0;
  for (const t of transactions) {
    if (t.type !== "contribution" || t.status !== "completed" || t.userId) continue;
    const plan = t.planId ? await ctx.db.get("plans", t.planId) : null;
    const planSponsorId = plan && plan.winningIndex !== undefined ? plan.options[plan.winningIndex]?.sponsorId : undefined;
    const matches = planSponsorId ? planSponsorId === sponsor._id : !!t.note && nameKey(t.note) === nameKey(sponsor.business);
    if (!matches) continue;
    pots.add(t.potId);
    total += t.amount;
  }
  return { pots: pots.size, total };
}

// Every redemption since the client's local midnight, newest first. The index range keeps this to one day of scans.
async function redeemedSince(ctx: QueryCtx, since: number, sponsorId: Id<"sponsors"> | null, businessId: Id<"businesses"> | null) {
  const rows = new Map<Id<"redemptions">, Doc<"redemptions">>();
  if (sponsorId) {
    for await (const r of ctx.db
      .query("redemptions")
      .withIndex("by_sponsor_and_status_and_redeemedAt", (q) => q.eq("sponsorId", sponsorId).eq("status", "redeemed").gte("redeemedAt", since))) {
      rows.set(r._id, r);
    }
  }
  if (businessId) {
    for await (const r of ctx.db
      .query("redemptions")
      .withIndex("by_business_and_status_and_redeemedAt", (q) => q.eq("businessId", businessId).eq("status", "redeemed").gte("redeemedAt", since))) {
      rows.set(r._id, r);
    }
  }
  return [...rows.values()].sort((a, b) => (b.redeemedAt ?? 0) - (a.redeemedAt ?? 0));
}

async function redemptionTitle(ctx: QueryCtx, row: Doc<"redemptions">) {
  if (row.kind === "experience") {
    const id = ctx.db.normalizeId("experiences", row.refId);
    return (id && (await ctx.db.get("experiences", id))?.title) || "Experience";
  }
  const sponsor = row.sponsorId ? await ctx.db.get("sponsors", row.sponsorId) : null;
  if (!sponsor) return row.kind === "reward" ? "Free treat" : "Offer";
  return row.kind === "reward" ? `Free treat: ${sponsor.offer}` : sponsor.offer;
}

async function linkedBusiness(ctx: QueryCtx, sponsor: Doc<"sponsors">) {
  const businesses = await ctx.db.query("businesses").take(200);
  const byName = businesses.find((b) => nameKey(b.name) === nameKey(sponsor.business));
  if (byName) return byName;
  for (const business of businesses) {
    const experiences = await ctx.db
      .query("experiences")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .take(50);
    if (experiences.some((e) => e.placeId === sponsor.placeId)) return business;
  }
  return null;
}

async function usedCount(ctx: QueryCtx, userId: Id<"users">, refId: string) {
  const rows = await ctx.db
    .query("redemptions")
    .withIndex("by_user_and_ref_and_status", (q) => q.eq("userId", userId).eq("refId", refId).eq("status", "redeemed"))
    .take(100);
  return rows.length;
}

// Mirrors redemptions.resolveItem: one use per confirmed pot-paid plan or completed purchase.
async function experienceUsesLeft(ctx: QueryCtx, userId: Id<"users">, experienceId: Id<"experiences">, crews: Doc<"groups">[]) {
  let paid = 0;
  for (const crew of crews) {
    const pot = await ctx.db
      .query("pots")
      .withIndex("by_group", (q) => q.eq("groupId", crew._id))
      .first();
    if (!pot) continue;
    const spends = (
      await ctx.db
        .query("transactions")
        .withIndex("by_pot", (q) => q.eq("potId", pot._id))
        .order("desc")
        .take(500)
    ).filter((t) => t.type === "spend" && t.status === "completed" && t.experienceId === experienceId && t.planId);
    for (const spend of spends) {
      const vote = await ctx.db
        .query("votes")
        .withIndex("by_plan_user", (q) => q.eq("planId", spend.planId!).eq("userId", userId))
        .first();
      if (vote?.confirmed) paid++;
    }
  }
  const purchases = await ctx.db
    .query("experiencePurchases")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(200);
  paid += purchases.filter((p) => p.experienceId === experienceId && p.status === "completed").length;
  return Math.max(0, paid - (await usedCount(ctx, userId, experienceId)));
}

export const listAccounts = query({
  args: {},
  handler: async (ctx) => {
    const [sponsors, businesses] = await Promise.all([ctx.db.query("sponsors").take(200), ctx.db.query("businesses").take(200)]);
    const accounts = new Map<string, { name: string; sponsorId: Id<"sponsors"> | null; sponsorActive: boolean; businessId: Id<"businesses"> | null }>();
    for (const s of sponsors) accounts.set(nameKey(s.business), { name: s.business, sponsorId: s._id, sponsorActive: s.active, businessId: null });
    for (const b of businesses) {
      const existing = accounts.get(nameKey(b.name));
      if (existing) existing.businessId = b._id;
      else accounts.set(nameKey(b.name), { name: b.name, sponsorId: null, sponsorActive: false, businessId: b._id });
    }
    return [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getHome = query({
  args: { sponsorId: v.optional(v.id("sponsors")), businessId: v.optional(v.id("businesses")), since: v.number() },
  handler: async (ctx, { sponsorId, businessId, since }) => {
    const [sponsor, business] = await Promise.all([
      sponsorId ? ctx.db.get("sponsors", sponsorId) : null,
      businessId ? ctx.db.get("businesses", businessId) : null,
    ]);
    if (!sponsor && !business) return null;

    const today = await redeemedSince(ctx, since, sponsor?._id ?? null, business?._id ?? null);
    const recent = await Promise.all(
      today.slice(0, 10).map(async (r) => ({
        redemptionId: r._id,
        kind: r.kind,
        itemTitle: await redemptionTitle(ctx, r),
        studentName: (await ctx.db.get("users", r.userId))?.name ?? "Student",
        redeemedAt: r.redeemedAt ?? r._creationTime,
      })),
    );

    // The ledger has no sponsor or experience index, so lifetime totals read every transaction once.
    const transactions: Doc<"transactions">[] = [];
    for await (const t of ctx.db.query("transactions")) {
      if (!t.userId || t.type === "spend") transactions.push(t);
    }

    let sponsorship = null;
    if (sponsor) {
      let visits = 0;
      let spentOnVisits = 0;
      for await (const visit of ctx.db.query("visits").withIndex("by_sponsor", (q) => q.eq("sponsorId", sponsor._id))) {
        visits++;
        spentOnVisits += visit.amount;
      }
      sponsorship = {
        sponsorId: sponsor._id,
        offer: sponsor.offer,
        active: sponsor.active,
        rewardCost: sponsor.rewardCost,
        visits,
        spentOnVisits,
        chipIns: await sponsorChipIns(ctx, sponsor, transactions),
      };
    }

    let sales = null;
    if (business) {
      const experiences = await ctx.db
        .query("experiences")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .take(100);
      const rows = await Promise.all(
        experiences.map(async (e) => {
          let purchases = 0;
          for await (const p of ctx.db.query("experiencePurchases").withIndex("by_experience", (q) => q.eq("experienceId", e._id))) {
            if (p.status === "completed") purchases++;
          }
          const potSales = transactions.filter((t) => t.type === "spend" && t.status === "completed" && t.experienceId === e._id).length;
          return {
            experienceId: e._id,
            title: e.title,
            pricePerPerson: e.pricePerPerson,
            active: e.active,
            sold: potSales + purchases,
          };
        }),
      );
      sales = {
        businessId: business._id,
        earned: business.earned,
        sold: rows.reduce((sum, r) => sum + r.sold, 0),
        experiences: rows.sort((a, b) => Number(b.active) - Number(a.active) || b.sold - a.sold),
      };
    }

    return {
      name: sponsor?.business ?? business!.name,
      today: { count: today.length, recent },
      sponsorship,
      sales,
    };
  },
});

export const getSponsorPage = query({
  args: { sponsorId: v.id("sponsors"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { sponsorId, userId }) => {
    const sponsor = await ctx.db.get("sponsors", sponsorId);
    if (!sponsor) return null;
    const [place, business, user] = await Promise.all([
      ctx.db.get("places", sponsor.placeId),
      linkedBusiness(ctx, sponsor),
      userId ? ctx.db.get("users", userId) : null,
    ]);
    const crews = user ? (await ctx.db.query("groups").order("desc").take(500)).filter((g) => g.memberIds.includes(user._id)) : [];

    const experiences = business
      ? await ctx.db
          .query("experiences")
          .withIndex("by_business", (q) => q.eq("businessId", business._id))
          .take(50)
      : [];
    const experienceRows = await Promise.all(
      experiences
        .filter((e) => e.active)
        .map(async (e) => ({
          experienceId: e._id,
          title: e.title,
          pricePerPerson: e.pricePerPerson,
          minGroup: e.minGroup,
          maxGroup: e.maxGroup,
          usesLeft: user ? await experienceUsesLeft(ctx, user._id, e._id, crews) : 0,
        })),
    );

    const rewards = [];
    if (user) {
      const mine = await ctx.db
        .query("rewards")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(100);
      for (const r of mine) {
        if (r.sponsorId !== sponsor._id || r.redeemedAt === undefined) continue;
        if ((await usedCount(ctx, user._id, r._id)) > 0) continue;
        rewards.push({ rewardId: r._id, code: r.code, unlockedAt: r.redeemedAt });
      }
    }

    return {
      sponsor: {
        _id: sponsor._id,
        business: sponsor.business,
        offer: sponsor.offer,
        priceLevel: sponsor.priceLevel,
        tags: sponsor.tags,
        rewardCost: sponsor.rewardCost,
        active: sponsor.active,
        area: place?.area ?? null,
      },
      diamonds: user?.diamonds ?? null,
      rewards,
      experiences: experienceRows,
    };
  },
});
