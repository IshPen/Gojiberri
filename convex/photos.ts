import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { external, scheduleExternal } from "./refs";
import { awardPoints, POINTS, STREAK_BONUS } from "./points";
import { DAY } from "./time";

const NOVEL_WINDOW = 30 * DAY;
const REGULAR_GAP = 14 * DAY;
const STREAK_LENGTH = 4;
const TOP_VIBES = 6;

type AwardItem = { reason: keyof typeof POINTS; points: number; label: string };

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

async function winningPlace(ctx: MutationCtx, plan: Doc<"plans"> | null) {
  const winner = plan && plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
  return winner ? await ctx.db.get("places", winner.placeId) : null;
}

const isCheckinFor = (planId: Id<"plans">) => (e: Doc<"pointEvents">) =>
  e.reason === "checkin" && e.planId === planId;

async function isNovel(
  ctx: MutationCtx,
  userId: Id<"users">,
  plan: Doc<"plans">,
  place: Doc<"places">,
  userEvents: Doc<"pointEvents">[],
) {
  const scores = new Map<string, number>();
  const bump = (term: string, by: number) => {
    const key = term.trim().toLowerCase();
    if (key) scores.set(key, (scores.get(key) ?? 0) + by);
  };
  const user = await ctx.db.get("users", userId);
  for (const vibe of user?.vibes ?? []) bump(vibe, 3);
  const ratings = await ctx.db
    .query("ratings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const rating of ratings) {
    if (rating.stars < 4) continue;
    bump(rating.vibe, 1);
    const rated = rating.planId ? await winningPlace(ctx, await ctx.db.get("plans", rating.planId)) : null;
    for (const term of rated ? [rated.category, ...rated.tags] : []) bump(term, 1);
  }
  const top = new Set(
    [...scores]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_VIBES)
      .map(([term]) => term),
  );
  if ([place.category, ...place.tags].some((term) => top.has(term.trim().toLowerCase()))) return false;

  const category = place.category.trim().toLowerCase();
  for (const event of userEvents) {
    if (event.reason !== "checkin" || !event.planId || event.planId === plan._id) continue;
    const past = await ctx.db.get("plans", event.planId);
    if (!past || Math.abs(past.window.start - plan.window.start) > NOVEL_WINDOW) continue;
    if ((await winningPlace(ctx, past))?.category.trim().toLowerCase() === category) return false;
  }
  return true;
}

async function crewStreak(
  ctx: MutationCtx,
  plan: Doc<"plans">,
  memberEvents: Map<Id<"users">, Doc<"pointEvents">[]>,
) {
  const checkedIn = new Set<Id<"plans">>();
  for (const events of memberEvents.values()) {
    for (const e of events) if (e.reason === "checkin" && e.planId) checkedIn.add(e.planId);
  }
  const earlier = (
    await ctx.db
      .query("plans")
      .withIndex("by_group", (q) => q.eq("groupId", plan.groupId))
      .collect()
  )
    .filter((p) => checkedIn.has(p._id) && p.window.start < plan.window.start)
    .sort((a, b) => b.window.start - a.window.start);
  let streak = 1;
  let previous = plan.window.start;
  for (const outing of earlier) {
    if (previous - outing.window.start > REGULAR_GAP) break;
    streak += 1;
    previous = outing.window.start;
  }
  return streak;
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
    const userEvents = memberEvents.get(args.userId) ?? [];
    const photoId = await ctx.db.insert("photos", {
      userId: args.userId,
      groupId: plan?.groupId ?? args.groupId,
      planId: args.planId,
      storageId: args.storageId,
      caption: args.caption?.trim() || undefined,
    });
    if (!plan || !group || userEvents.some(isCheckinFor(plan._id))) {
      return { photoId, total: 0, items: [] as AwardItem[] };
    }

    const source = { planId: plan._id, groupId: plan.groupId };
    const items: AwardItem[] = [{ reason: "checkin", points: POINTS.checkin, label: "Check-in" }];
    const place = await winningPlace(ctx, plan);
    if (place && (await isNovel(ctx, args.userId, plan, place, userEvents))) {
      items.push({ reason: "novel_bonus", points: POINTS.novel_bonus, label: "Tried something new" });
    }
    const streak = await crewStreak(ctx, plan, memberEvents);
    if (streak >= STREAK_LENGTH) {
      items.push({ reason: "regular_bonus", points: STREAK_BONUS, label: "4 outings in a row" });
    } else if (streak >= 2) {
      items.push({ reason: "regular_bonus", points: POINTS.regular_bonus, label: "Regular meetup" });
    }
    for (const item of items) await awardPoints(ctx, args.userId, item.reason, source, item.points);

    const wholeCrew = group.memberIds.every(
      (id) => id === args.userId || (memberEvents.get(id) ?? []).some(isCheckinFor(plan._id)),
    );
    for (const memberId of wholeCrew ? group.memberIds : []) {
      const events = memberEvents.get(memberId) ?? [];
      if (events.some((e) => e.reason === "fullcrew_bonus" && e.planId === plan._id)) continue;
      await awardPoints(ctx, memberId, "fullcrew_bonus", source);
      if (memberId === args.userId) {
        items.push({ reason: "fullcrew_bonus", points: POINTS.fullcrew_bonus, label: "Whole crew showed up" });
      }
    }

    const winner = plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
    await recordSponsorVisit(ctx, winner?.sponsorId, args.userId, photoId);

    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .take(100);
    const mine = deposits.find((d) => d.userId === args.userId && d.status === "held");
    if (mine) await scheduleExternal(ctx, external.refundDeposit, { depositId: mine._id });
    return { photoId, total: items.reduce((sum, item) => sum + item.points, 0), items };
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
      photos.map(async (photo) => {
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
