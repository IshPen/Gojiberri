import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TOKEN_LENGTH = 8;
const CODE_PREFIX = "GOJI";
const MAX_COUNTED = 1000;

const kindValidator = v.union(v.literal("offer"), v.literal("reward"), v.literal("experience"));
type Kind = "offer" | "reward" | "experience";

type Item = {
  itemTitle: string;
  businessName: string;
  businessId?: Id<"businesses">;
  sponsorId?: Id<"sponsors">;
  crewName: string | null;
};

function newToken() {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

function normalizeCode(code: string) {
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.startsWith(CODE_PREFIX) ? cleaned.slice(CODE_PREFIX.length) : cleaned;
}

async function crewsOf(ctx: QueryCtx, userId: Id<"users">) {
  const groups = await ctx.db.query("groups").order("desc").take(500);
  return groups.filter((g) => g.memberIds.includes(userId));
}

async function usedCount(ctx: QueryCtx, userId: Id<"users">, refId: string) {
  const rows = await ctx.db
    .query("redemptions")
    .withIndex("by_user_and_ref_and_status", (q) => q.eq("userId", userId).eq("refId", refId).eq("status", "redeemed"))
    .take(100);
  return rows.length;
}

// Throws a ConvexError with a user-facing reason when the student isn't entitled to the item right now.
async function resolveItem(ctx: QueryCtx, userId: Id<"users">, kind: Kind, refId: string): Promise<Item> {
  const crews = await crewsOf(ctx, userId);
  const firstCrew = crews[0]?.name ?? null;

  if (kind === "offer") {
    const sponsorId = ctx.db.normalizeId("sponsors", refId);
    const sponsor = sponsorId ? await ctx.db.get("sponsors", sponsorId) : null;
    if (!sponsor || !sponsor.active) throw new ConvexError("This offer isn't active anymore");
    return { itemTitle: sponsor.offer, businessName: sponsor.business, sponsorId: sponsor._id, crewName: firstCrew };
  }

  if (kind === "reward") {
    const rewardId = ctx.db.normalizeId("rewards", refId);
    const reward = rewardId ? await ctx.db.get("rewards", rewardId) : null;
    if (!reward || reward.userId !== userId || reward.redeemedAt === undefined) {
      throw new ConvexError("This reward isn't unlocked on your account");
    }
    if ((await usedCount(ctx, userId, refId)) > 0) throw new ConvexError("This reward was already used");
    const sponsor = await ctx.db.get("sponsors", reward.sponsorId);
    if (!sponsor) throw new ConvexError("This reward's sponsor is gone");
    return { itemTitle: `Free treat: ${sponsor.offer}`, businessName: sponsor.business, sponsorId: sponsor._id, crewName: firstCrew };
  }

  const experienceId = ctx.db.normalizeId("experiences", refId);
  const experience = experienceId ? await ctx.db.get("experiences", experienceId) : null;
  if (!experience) throw new ConvexError("Experience not found");
  let paid = 0;
  let payingCrew: Doc<"groups"> | null = null;
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
    ).filter((t) => t.type === "spend" && t.status === "completed" && t.experienceId === experience._id && t.planId);
    for (const planId of new Set(spends.map((t) => t.planId!))) {
      const vote = await ctx.db
        .query("votes")
        .withIndex("by_plan_user", (q) => q.eq("planId", planId).eq("userId", userId))
        .first();
      if (!vote?.confirmed) continue;
      payingCrew ??= crew;
      paid++;
    }
  }
  const purchases = (
    await ctx.db
      .query("experiencePurchases")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200)
  ).filter((p) => p.experienceId === experience._id && p.status === "completed");
  for (const purchase of purchases) {
    paid++;
    if (!payingCrew && purchase.groupId) payingCrew = await ctx.db.get("groups", purchase.groupId);
  }
  if (paid === 0) throw new ConvexError("Your crew hasn't paid for this experience yet");
  if ((await usedCount(ctx, userId, refId)) >= paid) throw new ConvexError("This experience was already redeemed");
  const business = await ctx.db.get("businesses", experience.businessId);
  return {
    itemTitle: experience.title,
    businessName: business?.name ?? "",
    businessId: experience.businessId,
    crewName: payingCrew?.name ?? firstCrew,
  };
}

async function expireIssued(ctx: MutationCtx, userId: Id<"users">, refId: string) {
  for await (const row of ctx.db
    .query("redemptions")
    .withIndex("by_user_and_ref_and_status", (q) => q.eq("userId", userId).eq("refId", refId).eq("status", "issued"))) {
    await ctx.db.patch("redemptions", row._id, { status: "expired" });
  }
}

export const createRedemptionCode = mutation({
  args: { userId: v.id("users"), kind: kindValidator, refId: v.string() },
  handler: async (ctx, { userId, kind, refId }) => {
    if (!(await ctx.db.get("users", userId))) throw new ConvexError("We couldn't find your account");
    const item = await resolveItem(ctx, userId, kind, refId);
    await expireIssued(ctx, userId, refId);
    const token = newToken();
    const expiresAt = Date.now() + CODE_TTL_MS;
    const redemptionId = await ctx.db.insert("redemptions", {
      token,
      kind,
      refId,
      userId,
      businessId: item.businessId,
      sponsorId: item.sponsorId,
      status: "issued",
      expiresAt,
    });
    return {
      redemptionId,
      code: `${CODE_PREFIX}-${token}`,
      expiresAt,
      itemTitle: item.itemTitle,
      businessName: item.businessName,
    };
  },
});

export const getRedemption = query({
  args: { redemptionId: v.id("redemptions") },
  handler: async (ctx, { redemptionId }) => {
    const row = await ctx.db.get("redemptions", redemptionId);
    if (!row) return null;
    return { status: row.status, expiresAt: row.expiresAt, redeemedAt: row.redeemedAt ?? null };
  },
});

export const redeemCode = mutation({
  args: { code: v.string(), businessId: v.union(v.id("businesses"), v.id("sponsors")) },
  handler: async (ctx, { code, businessId }) => {
    const invalid = (reason: string, details?: { studentName: string; crewName: string | null; itemTitle: string; kind: Kind }) => ({
      valid: false,
      reason,
      studentName: details?.studentName ?? null,
      crewName: details?.crewName ?? null,
      itemTitle: details?.itemTitle ?? null,
      kind: details?.kind ?? null,
    });

    const token = normalizeCode(code);
    if (!token) return invalid("enter a code");
    const row = await ctx.db
      .query("redemptions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!row) return invalid("code not found");

    if ((row.sponsorId ?? row.businessId) !== businessId) return invalid("wrong business, this code is for another place");

    const student = await ctx.db.get("users", row.userId);
    const details = { studentName: student?.name ?? "Student", crewName: null, itemTitle: await titleOf(ctx, row), kind: row.kind };
    if (row.status === "redeemed") return invalid("already used", details);
    if (row.status === "expired" || Date.now() > row.expiresAt) {
      if (row.status !== "expired") await ctx.db.patch("redemptions", row._id, { status: "expired" });
      return invalid("expired, ask for a fresh code", details);
    }

    let item: Item;
    try {
      item = await resolveItem(ctx, row.userId, row.kind, row.refId);
    } catch (e) {
      await ctx.db.patch("redemptions", row._id, { status: "expired" });
      return invalid(e instanceof ConvexError ? String(e.data) : "No longer valid", details);
    }

    await ctx.db.patch("redemptions", row._id, { status: "redeemed", redeemedAt: Date.now() });
    return { valid: true, reason: null, studentName: details.studentName, crewName: item.crewName, itemTitle: item.itemTitle, kind: row.kind };
  },
});

export const listRedemptions = query({
  args: { businessId: v.union(v.id("businesses"), v.id("sponsors")) },
  handler: async (ctx, { businessId }) => {
    const sponsorId = ctx.db.normalizeId("sponsors", businessId);
    const ownBusinessId = ctx.db.normalizeId("businesses", businessId);
    const redeemed = sponsorId
      ? await ctx.db
          .query("redemptions")
          .withIndex("by_sponsor_and_status_and_redeemedAt", (q) => q.eq("sponsorId", sponsorId).eq("status", "redeemed"))
          .order("desc")
          .take(MAX_COUNTED)
      : await ctx.db
          .query("redemptions")
          .withIndex("by_business_and_status_and_redeemedAt", (q) => q.eq("businessId", ownBusinessId ?? undefined).eq("status", "redeemed"))
          .order("desc")
          .take(MAX_COUNTED);
    const count = (kind: Kind) => redeemed.filter((r) => r.kind === kind).length;
    const recent = await Promise.all(
      redeemed.slice(0, 20).map(async (r) => {
        const student = await ctx.db.get("users", r.userId);
        const crew = (await crewsOf(ctx, r.userId))[0];
        return {
          redemptionId: r._id,
          kind: r.kind,
          itemTitle: await titleOf(ctx, r),
          studentName: student?.name ?? "Student",
          crewName: crew?.name ?? null,
          redeemedAt: r.redeemedAt ?? r._creationTime,
        };
      }),
    );
    return { total: redeemed.length, offers: count("offer"), rewards: count("reward"), experiences: count("experience"), recent };
  },
});

async function titleOf(ctx: QueryCtx, row: Doc<"redemptions">) {
  if (row.kind === "experience") {
    const id = ctx.db.normalizeId("experiences", row.refId);
    return (id && (await ctx.db.get("experiences", id))?.title) || "Experience";
  }
  const sponsor = row.sponsorId ? await ctx.db.get("sponsors", row.sponsorId) : null;
  if (!sponsor) return row.kind === "reward" ? "Free treat" : "Offer";
  return row.kind === "reward" ? `Free treat: ${sponsor.offer}` : sponsor.offer;
}

export const listRedeemers = query({
  args: {},
  handler: async (ctx) => {
    const sponsors = (await ctx.db.query("sponsors").take(100)).filter((s) => s.active);
    const businesses = await ctx.db.query("businesses").take(100);
    return [
      ...sponsors.map((s) => ({ id: s._id, name: s.business, type: "sponsor" as const })),
      ...businesses.map((b) => ({ id: b._id, name: b.name, type: "business" as const })),
    ];
  },
});
