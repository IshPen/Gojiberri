import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { external, scheduleExternal } from "./refs";
import { awardPoints } from "./points";

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
    if (plan) {
      if (plan.status !== "locked" && plan.status !== "done") {
        throw new ConvexError("You can only check in to a locked or done plan");
      }
      if (args.groupId && args.groupId !== plan.groupId) {
        throw new ConvexError("This plan belongs to a different crew");
      }
      const group = await ctx.db.get("groups", plan.groupId);
      if (!group?.memberIds.includes(args.userId)) {
        throw new ConvexError("Only members of this plan's crew can check in");
      }
    }
    const groupId = plan?.groupId ?? args.groupId;
    let alreadyCheckedIn = false;
    if (plan) {
      for await (const event of ctx.db
        .query("pointEvents")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
        if (event.reason === "checkin" && event.planId === plan._id) {
          alreadyCheckedIn = true;
          break;
        }
      }
    }
    const photoId = await ctx.db.insert("photos", {
      userId: args.userId,
      groupId,
      planId: args.planId,
      storageId: args.storageId,
      caption: args.caption?.trim() || undefined,
    });
    if (!plan || alreadyCheckedIn) return photoId;
    await awardPoints(ctx, args.userId, "checkin", { planId: plan._id, groupId: plan.groupId });

    const winner = plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
    await recordSponsorVisit(ctx, winner?.sponsorId, args.userId, photoId);

    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .take(100);
    const mine = deposits.find((d) => d.userId === args.userId && d.status === "held");
    if (mine) await scheduleExternal(ctx, external.refundDeposit, { depositId: mine._id });
    return photoId;
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
