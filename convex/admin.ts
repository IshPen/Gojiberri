import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

const CHECKIN_REASONS: Doc<"pointEvents">["reason"][] = ["checkin", "novel_bonus", "regular_bonus", "fullcrew_bonus"];

async function deletePointEvent(ctx: MutationCtx, event: Doc<"pointEvents">) {
  const user = await ctx.db.get("users", event.userId);
  if (user) {
    const patch: Partial<Doc<"users">> = { points: Math.max(0, user.points - event.points) };
    if (event.points < 0 && user.gojisSpent !== undefined) {
      patch.gojisSpent = Math.max(0, user.gojisSpent + event.points);
    }
    await ctx.db.patch("users", user._id, patch);
  }
  await ctx.db.delete("pointEvents", event._id);
}

async function deletePhoto(ctx: MutationCtx, photo: Doc<"photos">) {
  await ctx.storage.delete(photo.storageId);
  await ctx.db.delete("photos", photo._id);
}

export const removeFromGroup = internalMutation({
  args: { groupId: v.id("groups"), userId: v.id("users") },
  handler: async (ctx, { groupId, userId }) => {
    const group = await ctx.db.get("groups", groupId);
    if (!group) throw new Error("Group not found");
    const memberIds = group.memberIds.filter((id) => id !== userId);
    await ctx.db.patch("groups", groupId, { memberIds });
    return memberIds.length;
  },
});

export const deletePlanCascade = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get("plans", planId);
    if (!plan) throw new Error("Plan not found");
    const votes = await ctx.db.query("votes").withIndex("by_plan", (q) => q.eq("planId", planId)).collect();
    for (const vote of votes) await ctx.db.delete("votes", vote._id);
    const photos = await ctx.db.query("photos").withIndex("by_plan", (q) => q.eq("planId", planId)).collect();
    for (const photo of photos) await deletePhoto(ctx, photo);
    const pointEvents = (await ctx.db.query("pointEvents").collect()).filter((e) => e.planId === planId);
    for (const event of pointEvents) await deletePointEvent(ctx, event);
    const gojiQuotes = (await ctx.db.query("gojiQuotes").collect()).filter((q) => q.planId === planId);
    for (const quote of gojiQuotes) await ctx.db.delete("gojiQuotes", quote._id);
    await ctx.db.delete("plans", planId);
    return {
      votes: votes.length,
      photos: photos.length,
      pointEvents: pointEvents.length,
      pointsRemoved: pointEvents.reduce((sum, e) => sum + e.points, 0),
      gojiQuotes: gojiQuotes.length,
      plans: 1,
    };
  },
});

export const deletePhotoCascade = internalMutation({
  args: { photoId: v.id("photos") },
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get("photos", photoId);
    if (!photo) throw new Error("Photo not found");
    await deletePhoto(ctx, photo);
    const planId = photo.planId;
    if (!planId) return { photos: 1, pointEvents: 0, pointsRemoved: 0 };
    const otherPhotos = await ctx.db.query("photos").withIndex("by_plan", (q) => q.eq("planId", planId)).collect();
    if (otherPhotos.some((p) => p.userId === photo.userId)) return { photos: 1, pointEvents: 0, pointsRemoved: 0 };
    const pointEvents = (
      await ctx.db.query("pointEvents").withIndex("by_user", (q) => q.eq("userId", photo.userId)).collect()
    ).filter((e) => e.planId === planId && CHECKIN_REASONS.includes(e.reason));
    for (const event of pointEvents) await deletePointEvent(ctx, event);
    return {
      photos: 1,
      pointEvents: pointEvents.length,
      pointsRemoved: pointEvents.reduce((sum, e) => sum + e.points, 0),
    };
  },
});
