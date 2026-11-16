import { ConvexError, Infer, v } from "convex/values";
import { env, internalAction, internalMutation, mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { external, scheduleExternal } from "./refs";
import { AwardItem, awardPoints, checkinItems, crewStreak, FULLCREW_ITEM } from "./points";
import { lockQuote } from "./novelty";
import { CHECKIN_REASONS, deletePointEvent } from "./admin";
import { visionJSON } from "./llm";

const NEAR_M = 300;
const FAR_M = 2000;
const MAX_ACCURACY_M = 1000;
const CV_TIMEOUT_MS = 20_000;

const geoValidator = v.union(v.literal("near"), v.literal("between"), v.literal("far"), v.literal("unknown"));
type Geo = Infer<typeof geoValidator>;
type Cv = { ok: boolean; reason: string } | null;
const settledValidator = v.union(v.literal("verified"), v.literal("unverified"), v.literal("rejected"));

const strictMode = () => env.CHECKIN_VERIFY?.trim().toLowerCase() === "strict";
const farReason = (placeName: string) => `You don't seem to be at ${placeName}`;

async function checkinPlace(ctx: QueryCtx, plan: Doc<"plans">) {
  const option = plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
  if (!option) return { name: "the plan's spot", coords: null };
  const experience = option.experienceId ? await ctx.db.get("experiences", option.experienceId) : null;
  const place = await ctx.db.get("places", experience?.placeId ?? option.placeId);
  const known = place && Number.isFinite(place.lat) && Number.isFinite(place.lng) && (place.lat !== 0 || place.lng !== 0);
  return { name: place?.name ?? option.title, coords: known ? { lat: place.lat, lng: place.lng } : null };
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function geoVerdict(distanceM: number | undefined, accuracy: number | undefined): Geo {
  if (distanceM === undefined) return "unknown";
  if (distanceM > FAR_M) return "far";
  const slack = accuracy !== undefined && Number.isFinite(accuracy) ? Math.min(Math.max(accuracy, 0), MAX_ACCURACY_M) : 0;
  return distanceM <= NEAR_M + slack ? "near" : "between";
}

export function decideCheckin(geo: Geo, cv: Cv, placeName: string) {
  if (geo === "far") return { status: "rejected" as const, reason: farReason(placeName) };
  if (cv && !cv.ok) return { status: "rejected" as const, reason: cv.reason || "This doesn't look like a photo from the outing" };
  if (geo === "near" || cv?.ok) return { status: "verified" as const };
  return { status: "unverified" as const, reason: "We couldn't check the location or the photo" };
}

export async function recordSponsorVisit(
  ctx: MutationCtx,
  sponsorId: Id<"sponsors"> | undefined,
  userId: Id<"users">,
  photoId: Id<"photos">,
) {
  if (!sponsorId) return;
  const sponsor = await ctx.db.get("sponsors", sponsorId);
  if (!sponsor) return;
  await ctx.db.insert("visits", { sponsorId, userId, photoId, amount: sponsor.payPerVisit });
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const savePhoto = mutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    groupId: v.optional(v.id("groups")),
    planId: v.optional(v.id("plans")),
    caption: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const plan = args.planId ? await ctx.db.get("plans", args.planId) : null;
    if (args.planId && !plan) throw new ConvexError("Plan not found");
    const group = plan ? await ctx.db.get("groups", plan.groupId) : null;
    if (plan) {
      if (plan.status !== "locked" && plan.status !== "done") {
        throw new ConvexError("You can only check in to a locked or done plan");
      }
      if (args.groupId && args.groupId !== plan.groupId) {
        throw new ConvexError("This plan belongs to a different crew");
      }
      if (!group?.memberIds.includes(args.userId)) {
        throw new ConvexError("Only members of this plan's crew can check in");
      }
    }
    const memberEvents = new Map<Id<"users">, Doc<"pointEvents">[]>();
    for (const memberId of plan ? (group?.memberIds ?? []) : []) {
      memberEvents.set(
        memberId,
        await ctx.db
          .query("pointEvents")
          .withIndex("by_user", (q) => q.eq("userId", memberId))
          .collect(),
      );
    }
    const isCheckin = (e: Doc<"pointEvents">) => e.reason === "checkin" && e.planId === plan?._id;
    const earns = !!plan && !!group && !(memberEvents.get(args.userId) ?? []).some(isCheckin);
    const place = earns && plan ? await checkinPlace(ctx, plan) : null;
    const located =
      args.lat !== undefined && args.lng !== undefined && Math.abs(args.lat) <= 90 && Math.abs(args.lng) <= 180;
    const distanceM =
      place?.coords && located ? Math.round(distanceMeters(place.coords, { lat: args.lat!, lng: args.lng! })) : undefined;
    const geo = geoVerdict(distanceM, args.accuracy);
    if (place && geo === "far" && strictMode()) throw new ConvexError(farReason(place.name));

    const photoId = await ctx.db.insert("photos", {
      userId: args.userId,
      groupId: plan?.groupId ?? args.groupId,
      planId: args.planId,
      storageId: args.storageId,
      caption: args.caption?.trim() || undefined,
      ...(earns ? { verifyStatus: "verifying" as const, distanceM } : {}),
    });
    if (!plan || !group || !place) {
      return { photoId, total: 0, items: [] as AwardItem[], verification: "skipped" as const };
    }

    const source = { planId: plan._id, groupId: plan.groupId };
    const novelty = await lockQuote(ctx, args.userId, plan);
    const items = checkinItems(novelty.points, await crewStreak(ctx, group, plan.window.start, plan._id));
    for (const item of items) await awardPoints(ctx, args.userId, item.reason, source, item.points);
    await ctx.scheduler.runAfter(0, internal.taste.rebuild, { userId: args.userId });
    await ctx.scheduler.runAfter(0, internal.memory.rememberCheckin, { photoId });

    const wholeCrew = group.memberIds.every(
      (id) => id === args.userId || (memberEvents.get(id) ?? []).some(isCheckin),
    );
    for (const memberId of wholeCrew ? group.memberIds : []) {
      const events = memberEvents.get(memberId) ?? [];
      if (events.some((e) => e.reason === "fullcrew_bonus" && e.planId === plan._id)) continue;
      await awardPoints(ctx, memberId, "fullcrew_bonus", source);
      if (memberId === args.userId) items.push(FULLCREW_ITEM);
    }

    const winner = plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
    await recordSponsorVisit(ctx, winner?.sponsorId, args.userId, photoId);

    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .take(100);
    const mine = deposits.find((d) => d.userId === args.userId && d.status === "held");
    if (mine) await scheduleExternal(ctx, external.refundDeposit, { depositId: mine._id });
    await ctx.scheduler.runAfter(0, internal.photos.verifyCheckin, {
      photoId,
      storageId: args.storageId,
      placeName: place.name,
      geo,
    });
    return {
      photoId,
      total: items.reduce((sum, item) => sum + item.points, 0),
      items,
      verification: "pending" as const,
    };
  },
});

async function visionCheck(imageUrl: string, placeName: string): Promise<Cv> {
  const result = await visionJSON<{ ok?: unknown; reason?: unknown }>(
    'You check photos people post to prove they showed up to a group outing. Reply with JSON {"ok": boolean, "reason": string}. ' +
      "Set ok to false when the image is a screenshot or has app UI on it, is a meme or has overlaid text, is blank, black or too dark to see anything, " +
      "or looks like a stock, professional or downloaded image. Set ok to true for a real phone photo taken in person, even if it does not clearly show the venue. " +
      "reason is one short, friendly sentence shown to the person.",
    `They say they are at ${placeName}.`,
    imageUrl,
    CV_TIMEOUT_MS,
  );
  if (typeof result.ok !== "boolean") throw new Error("Vision check returned no verdict");
  return { ok: result.ok, reason: typeof result.reason === "string" ? result.reason.slice(0, 200) : "" };
}

export const verifyCheckin = internalAction({
  args: { photoId: v.id("photos"), storageId: v.id("_storage"), placeName: v.string(), geo: geoValidator },
  handler: async (ctx, { photoId, storageId, placeName, geo }) => {
    let cv: Cv = null;
    if (geo !== "far") {
      try {
        const url = await ctx.storage.getUrl(storageId);
        if (url) cv = await visionCheck(url, placeName);
      } catch (err) {
        console.warn("Check-in vision check failed, using geo only", err);
      }
    }
    const decision = decideCheckin(geo, cv, placeName);
    await ctx.runMutation(internal.photos.settleCheckin, { photoId, ...decision, cvOk: cv?.ok });
    return null;
  },
});

export const settleCheckin = internalMutation({
  args: {
    photoId: v.id("photos"),
    status: settledValidator,
    reason: v.optional(v.string()),
    cvOk: v.optional(v.boolean()),
  },
  handler: async (ctx, { photoId, status, reason, cvOk }) => {
    const photo = await ctx.db.get("photos", photoId);
    if (!photo || photo.verifyStatus !== "verifying") return null;
    const reverse = status === "rejected" && strictMode() && photo.planId !== undefined;
    if (reverse) {
      const events = (
        await ctx.db.query("pointEvents").withIndex("by_user", (q) => q.eq("userId", photo.userId)).collect()
      ).filter((e) => e.planId === photo.planId && CHECKIN_REASONS.includes(e.reason));
      for (const event of events) await deletePointEvent(ctx, event);
      const visits = (await ctx.db.query("visits").collect()).filter((visit) => visit.photoId === photoId);
      for (const visit of visits) await ctx.db.delete("visits", visit._id);
    }
    await ctx.db.patch("photos", photoId, {
      verifyStatus: status,
      verifyReason: reason,
      cvOk,
      ...(reverse ? { hidden: true } : {}),
    });
    return null;
  },
});

export const getCheckinStatus = query({
  args: { photoId: v.id("photos") },
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get("photos", photoId);
    if (!photo?.verifyStatus) return null;
    return {
      status: photo.verifyStatus,
      reason: photo.verifyReason,
      distanceM: photo.distanceM,
      cvOk: photo.cvOk,
    };
  },
});

export const getGroupStory = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const photos = await ctx.db
      .query("photos")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .order("desc")
      .take(100);
    return await Promise.all(
      photos.filter((photo) => !photo.hidden).map(async (photo) => {
        const [user, plan, url] = await Promise.all([
          ctx.db.get("users", photo.userId),
          photo.planId ? ctx.db.get("plans", photo.planId) : null,
          ctx.storage.getUrl(photo.storageId),
        ]);
        const winner = plan && plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : null;
        return {
          _id: photo._id,
          _creationTime: photo._creationTime,
          url,
          userName: user?.name ?? "Someone",
          avatarUrl: user?.avatarUrl,
          planId: photo.planId,
          planTitle: winner?.title ?? null,
          caption: photo.caption,
        };
      }),
    );
  },
});
