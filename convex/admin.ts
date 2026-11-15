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

// Old seeded copy -> live marketing copy. rewriteDemoCopy only replaces exact matches.
const DEMO_COPY = new Map<string, string>([
  [
    "Demo: Crew music night",
    "Crew music night",
  ],
  [
    "Fictional demo package based on the real Guild Theatre in Menlo Park. The $26 price and group booking are not venue offers; check the venue calendar for actual tickets and age restrictions.",
    "Grab the crew and catch a live set at the Guild Theatre in Menlo Park. $26 a person for groups of 2 to 8. Check the show calendar for age limits.",
  ],
  [
    "Demo: Friends concert outing",
    "Friends concert outing",
  ],
  [
    "Fictional $20 demo package at the real Guild Theatre, not a student discount or a confirmed performance. Actual tickets, availability and age restrictions vary by show.",
    "A $20 night of live music at the Guild Theatre for you and up to five friends. Pick a show, sing along, and make it a night.",
  ],
  [
    "Demo: Pizza study break",
    "Pizza study break",
  ],
  [
    "Fictional $9-per-person demo package based on the real Pizza My Heart at 220 University Avenue. Not a restaurant offer, reservation or guaranteed meal price.",
    "Hot slices for the whole study group at Pizza My Heart on University Avenue. $9 a person, the cheapest way to survive midterms together.",
  ],
  [
    "Demo: Boba with friends",
    "Boba with friends",
  ],
  [
    "Fictional $12 demo tasting package based on the real Teaspoon at 2675 Middlefield Road. Not a shop offer or reserved event; order real drinks from the shop's menu.",
    "A $12 boba tasting for your crew at Teaspoon on Middlefield Road. Brown sugar, taro, and whatever flavor your friends dare you to try.",
  ],
  [
    "Demo: Coffee and catch-up",
    "Coffee and catch-up",
  ],
  [
    "Fictional $22 demo food-and-coffee package based on the real Coupa Cafe at 538 Ramona Street. Not a cafe offer, student discount or reservation.",
    "Lattes and bites for $22 a person at Coupa Cafe on Ramona Street. The go-to downtown spot to catch up between classes.",
  ],
  [
    "Demo only: $10 into your crew's pot for music night. Fictional sponsorship, not a venue offer.",
    "$10 into your crew's pot for music night at the Guild.",
  ],
  [
    "Demo only: free boba topping for Stanford friends. Fictional reward, not redeemable at the shop.",
    "Free boba topping for Stanford friends.",
  ],
  [
    "Demo only: two-for-one coffee for Stanford friends. Fictional reward, not redeemable at the cafe.",
    "Two-for-one coffee for Stanford friends.",
  ],
  [
    "Your crew loved music night. Demo package with a fictional $10 sponsor chip-in, not a venue offer.",
    "Your crew loved music night, and the Guild is chipping $10 into your pot.",
  ],
  [
    "A crew favorite with a fictional $9 demo package, not a restaurant offer.",
    "A crew favorite: $9 slices for everyone.",
  ],
]);

const COPY_TABLES = ["experiences", "sponsors", "businesses", "places"] as const;

export const rewriteDemoCopy = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts: Record<(typeof COPY_TABLES)[number] | "plans", number> = { experiences: 0, sponsors: 0, businesses: 0, places: 0, plans: 0 };
    for (const table of COPY_TABLES) {
      for (const doc of await ctx.db.query(table).collect()) {
        const patch = Object.fromEntries(
          Object.entries(doc).flatMap(([field, value]) =>
            typeof value === "string" && DEMO_COPY.has(value) ? [[field, DEMO_COPY.get(value)!]] : [],
          ),
        );
        if (Object.keys(patch).length === 0) continue;
        await ctx.db.patch(table, doc._id, patch);
        counts[table]++;
      }
    }
    for (const plan of await ctx.db.query("plans").collect()) {
      if (!plan.options.some((o) => DEMO_COPY.has(o.why))) continue;
      const options = plan.options.map((o) => ({ ...o, why: DEMO_COPY.get(o.why) ?? o.why }));
      await ctx.db.patch("plans", plan._id, { options });
      counts.plans++;
    }
    return counts;
  },
});
