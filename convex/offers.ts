import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const DEFAULT_SCHOOL = "Stanford";
const MAX_LISTED = 100;

const perkValidator = v.union(v.literal("discount"), v.literal("freebie"));

export function perkLabel(offer: Pick<Doc<"offers">, "perk" | "discountPercent">) {
  return offer.perk === "discount" ? `${offer.discountPercent ?? 0}% off` : "Free";
}

async function accountName(ctx: QueryCtx, sponsorId?: Id<"sponsors">, businessId?: Id<"businesses">) {
  const [sponsor, business] = await Promise.all([
    sponsorId ? ctx.db.get("sponsors", sponsorId) : null,
    businessId ? ctx.db.get("businesses", businessId) : null,
  ]);
  if (sponsorId && !sponsor) throw new ConvexError("Sponsor not found");
  if (businessId && !business) throw new ConvexError("Business not found");
  const name = sponsor?.business ?? business?.name;
  if (!name) throw new ConvexError("Pick a business first");
  return name;
}

async function crewsOf(ctx: QueryCtx, userId: Id<"users">) {
  return (await ctx.db.query("groups").order("desc").take(500)).filter((g) => g.memberIds.includes(userId));
}

type Eligibility = { claimable: boolean; reason: string | null; claimId: Id<"offerClaims"> | null; redeemed: boolean };

async function eligibility(ctx: QueryCtx, offer: Doc<"offers">, user: Doc<"users"> | null, now: number): Promise<Eligibility & { crew: Doc<"groups"> | null }> {
  const claim = user
    ? await ctx.db
        .query("offerClaims")
        .withIndex("by_offer_and_user", (q) => q.eq("offerId", offer._id).eq("userId", user._id))
        .first()
    : null;
  const base = { claimId: claim?._id ?? null, redeemed: claim?.redeemedAt !== undefined, crew: null };
  const no = (reason: string) => ({ ...base, claimable: false, reason });
  if (claim) return no(claim.redeemedAt !== undefined ? "You already used this offer" : "Already claimed");
  if (!offer.active) return no("This offer is paused");
  if (offer.expiresAt <= now) return no("This offer has expired");
  if (offer.quantityCap !== undefined && offer.claimedCount >= offer.quantityCap) return no("All claimed");
  if (!user) return no("Join your school to claim offers");
  if (user.homeArea !== offer.school) return no(`Only for ${offer.school} students`);
  const crew = (await crewsOf(ctx, user._id)).sort((a, b) => b.memberIds.length - a.memberIds.length)[0] ?? null;
  if (!crew || crew.memberIds.length < offer.minCrewSize) return no(`Needs a crew of ${offer.minCrewSize}+`);
  if (user.points < offer.gojiCost) return no(`Needs ${offer.gojiCost} Gojis, you have ${user.points}`);
  return { ...base, crew, claimable: true, reason: null };
}

function studentRow(offer: Doc<"offers">, e: Eligibility) {
  return {
    _id: offer._id,
    businessName: offer.businessName,
    title: offer.title,
    description: offer.description,
    perk: perkLabel(offer),
    school: offer.school,
    minCrewSize: offer.minCrewSize,
    expiresAt: offer.expiresAt,
    left: offer.quantityCap === undefined ? null : Math.max(0, offer.quantityCap - offer.claimedCount),
    gojiCost: offer.gojiCost,
    claimable: e.claimable,
    reason: e.reason,
    claimId: e.claimId,
    redeemed: e.redeemed,
  };
}

export const saveOffer = mutation({
  args: {
    offerId: v.optional(v.id("offers")),
    sponsorId: v.optional(v.id("sponsors")),
    businessId: v.optional(v.id("businesses")),
    title: v.string(),
    description: v.string(),
    perk: perkValidator,
    discountPercent: v.optional(v.number()),
    school: v.string(),
    minCrewSize: v.number(),
    expiresAt: v.number(),
    quantityCap: v.optional(v.number()),
    gojiCost: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, { offerId, sponsorId, businessId, ...fields }) => {
    const title = fields.title.trim();
    const description = fields.description.trim();
    const school = fields.school.trim() || DEFAULT_SCHOOL;
    if (!title) throw new ConvexError("Give the offer a title");
    if (fields.perk === "discount" && !(Number.isInteger(fields.discountPercent) && fields.discountPercent! >= 1 && fields.discountPercent! <= 100)) {
      throw new ConvexError("Discount must be a whole number from 1 to 100");
    }
    if (!Number.isInteger(fields.minCrewSize) || fields.minCrewSize < 1) throw new ConvexError("Min crew size must be 1 or more");
    if (fields.quantityCap !== undefined && (!Number.isInteger(fields.quantityCap) || fields.quantityCap < 1)) {
      throw new ConvexError("Quantity cap must be 1 or more, or left blank");
    }
    if (!Number.isInteger(fields.gojiCost) || fields.gojiCost < 0) throw new ConvexError("Goji cost must be 0 or more");
    const values = {
      ...fields,
      title,
      description,
      school,
      discountPercent: fields.perk === "discount" ? fields.discountPercent : undefined,
    };

    if (offerId) {
      const offer = await ctx.db.get("offers", offerId);
      if (!offer) throw new ConvexError("Offer not found");
      if (values.quantityCap !== undefined && values.quantityCap < offer.claimedCount) {
        throw new ConvexError(`${offer.claimedCount} already claimed, so the cap can't go below that`);
      }
      await ctx.db.patch("offers", offerId, values);
      return offerId;
    }

    if (values.expiresAt <= Date.now()) throw new ConvexError("Pick an expiry in the future");
    const businessName = await accountName(ctx, sponsorId, businessId);
    return await ctx.db.insert("offers", { ...values, businessName, sponsorId, businessId, claimedCount: 0, redeemedCount: 0 });
  },
});

export const getOffer = query({
  args: { offerId: v.id("offers") },
  handler: async (ctx, { offerId }) => await ctx.db.get("offers", offerId),
});

export const listForBusiness = query({
  args: { sponsorId: v.optional(v.id("sponsors")), businessId: v.optional(v.id("businesses")) },
  handler: async (ctx, { sponsorId, businessId }) => {
    const name = await accountName(ctx, sponsorId, businessId);
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_businessName", (q) => q.eq("businessName", name))
      .order("desc")
      .take(MAX_LISTED);
    const now = Date.now();
    return offers.map((o) => ({
      _id: o._id,
      title: o.title,
      perk: perkLabel(o),
      school: o.school,
      expiresAt: o.expiresAt,
      quantityCap: o.quantityCap ?? null,
      claimedCount: o.claimedCount,
      redeemedCount: o.redeemedCount,
      status: !o.active ? ("paused" as const) : o.expiresAt <= now ? ("expired" as const) : o.quantityCap !== undefined && o.claimedCount >= o.quantityCap ? ("sold_out" as const) : ("live" as const),
    }));
  },
});

export const listForStudent = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return [];
    const now = Date.now();
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_school_and_active_and_expiresAt", (q) => q.eq("school", user.homeArea).eq("active", true).gt("expiresAt", now))
      .take(MAX_LISTED);
    const rows = await Promise.all(offers.map(async (o) => studentRow(o, await eligibility(ctx, o, user, now))));
    return rows
      .filter((r) => r.claimable || r.claimId)
      .sort((a, b) => Number(!!a.redeemed) - Number(!!b.redeemed) || a.expiresAt - b.expiresAt);
  },
});

export const getForStudent = query({
  args: { offerId: v.id("offers"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { offerId, userId }) => {
    const offer = await ctx.db.get("offers", offerId);
    if (!offer) return null;
    const user = userId ? await ctx.db.get("users", userId) : null;
    return { ...studentRow(offer, await eligibility(ctx, offer, user, Date.now())), points: user?.points ?? null };
  },
});

export const claimOffer = mutation({
  args: { offerId: v.id("offers"), userId: v.id("users") },
  handler: async (ctx, { offerId, userId }) => {
    const [offer, user] = await Promise.all([ctx.db.get("offers", offerId), ctx.db.get("users", userId)]);
    if (!offer) throw new ConvexError("This offer is gone");
    if (!user) throw new ConvexError("We couldn't find your account");
    const e = await eligibility(ctx, offer, user, Date.now());
    if (!e.claimable || !e.crew) throw new ConvexError(e.reason ?? "You can't claim this offer");

    if (offer.gojiCost > 0) {
      await ctx.db.patch("users", user._id, { points: user.points - offer.gojiCost, gojisSpent: (user.gojisSpent ?? 0) + offer.gojiCost });
      await ctx.db.insert("pointEvents", { userId: user._id, reason: "offer_claim", points: -offer.gojiCost, groupId: e.crew._id });
    }
    const claimId = await ctx.db.insert("offerClaims", { offerId, userId, groupId: e.crew._id, gojisSpent: offer.gojiCost });
    await ctx.db.patch("offers", offerId, { claimedCount: offer.claimedCount + 1 });
    return claimId;
  },
});
