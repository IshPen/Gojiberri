import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { external, scheduleExternal } from "./refs";
import { AwardItem, awardPoints, checkinItems, crewStreak, FULLCREW_ITEM } from "./points";
import { lockQuote } from "./novelty";

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
    const photoId = await ctx.db.insert("photos", {
      userId: args.userId,
      groupId: plan?.groupId ?? args.groupId,
      planId: args.planId,
      storageId: args.storageId,
      caption: args.caption?.trim() || undefined,
    });
    if (!plan || !group || (memberEvents.get(args.userId) ?? []).some(isCheckin)) {
      return { photoId, total: 0, items: [] as AwardItem[] };
    }

    const source = { planId: plan._id, groupId: plan.groupId };
    const novelty = await lockQuote(ctx, args.userId, plan);
    const items = checkinItems(novelty.points, await crewStreak(ctx, group, plan.window.start, plan._id));
    for (const item of items) await awardPoints(ctx, args.userId, item.reason, source, item.points);
    await ctx.scheduler.runAfter(0, internal.taste.rebuild, { userId: args.userId });

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
