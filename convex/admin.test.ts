/// <reference types="vite/client" />

import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (name: string, points: number) =>
      ctx.db.insert("users", {
        name, budgetMax: 30, homeArea: "Stanford", diet: [], vibes: [],
        onboarded: true, points, diamonds: 0, streak: 0, busyBlocks: [],
      });
    const ana = await user("Ana", 100);
    const ben = await user("Ben", 30);
    const placeId = await ctx.db.insert("places", {
      name: "Cafe", area: "Stanford", category: "food", priceLevel: 1, tags: [], lat: 0, lng: 0, durationMins: 60,
    });
    const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW00", ownerId: ana, memberIds: [ana, ben] });
    const plan = () =>
      ctx.db.insert("plans", {
        groupId, window: { start: 0, end: 1 }, status: "done", winningIndex: 0, confirmBy: 0,
        options: [{ placeId, title: "Cafe", costMin: 0, costMax: 10, why: "" }],
      });
    const planId = await plan();
    const otherPlanId = await plan();
    const storageId = await ctx.storage.store(new Blob(["x"]));
    const photoId = await ctx.db.insert("photos", { userId: ana, groupId, planId, storageId });
    await ctx.db.insert("votes", { planId, userId: ana, optionIndex: 0, confirmed: true });
    await ctx.db.insert("votes", { planId, userId: ben, optionIndex: 0, confirmed: true });
    await ctx.db.insert("pointEvents", { userId: ana, reason: "checkin", points: 50, planId, groupId });
    await ctx.db.insert("pointEvents", { userId: ana, reason: "fullcrew_bonus", points: 20, planId, groupId });
    await ctx.db.insert("pointEvents", { userId: ben, reason: "confirm", points: 15, planId, groupId });
    await ctx.db.insert("pointEvents", { userId: ben, reason: "fullcrew_bonus", points: 20, planId, groupId });
    await ctx.db.insert("pointEvents", { userId: ana, reason: "checkin", points: 50, planId: otherPlanId, groupId });
    await ctx.db.insert("gojiQuotes", {
      userId: ana, planId, ideaKey: "place:x", score: 1, points: 25, reason: null, source: "fallback",
    });
    return { ana, ben, groupId, planId, otherPlanId, photoId, storageId };
  });
  return { t, ids };
}

it("deletePlanCascade removes plan data and refunds points without going negative", async () => {
  const { t, ids } = await setup();
  const result = await t.mutation(internal.admin.deletePlanCascade, { planId: ids.planId });
  expect(result).toEqual({ votes: 2, photos: 1, pointEvents: 4, pointsRemoved: 105, gojiQuotes: 1, plans: 1 });
  await t.run(async (ctx) => {
    expect(await ctx.db.get("plans", ids.planId)).toBeNull();
    expect(await ctx.db.get("plans", ids.otherPlanId)).not.toBeNull();
    expect(await ctx.storage.getUrl(ids.storageId)).toBeNull();
    expect((await ctx.db.get("users", ids.ana))!.points).toBe(30);
    expect((await ctx.db.get("users", ids.ben))!.points).toBe(0);
    const events = await ctx.db.query("pointEvents").collect();
    expect(events.map((e) => e.planId)).toEqual([ids.otherPlanId]);
    expect(await ctx.db.query("votes").collect()).toHaveLength(0);
    expect(await ctx.db.query("gojiQuotes").collect()).toHaveLength(0);
  });
});

it("deletePhotoCascade removes the photo and its owner's check-in points only", async () => {
  const { t, ids } = await setup();
  const result = await t.mutation(internal.admin.deletePhotoCascade, { photoId: ids.photoId });
  expect(result).toEqual({ photos: 1, pointEvents: 2, pointsRemoved: 70 });
  await t.run(async (ctx) => {
    expect(await ctx.db.get("photos", ids.photoId)).toBeNull();
    expect((await ctx.db.get("users", ids.ana))!.points).toBe(30);
    expect((await ctx.db.get("users", ids.ben))!.points).toBe(30);
    expect(await ctx.db.query("pointEvents").collect()).toHaveLength(3);
  });
});

it("removeFromGroup drops the member and returns the new count", async () => {
  const { t, ids } = await setup();
  expect(await t.mutation(internal.admin.removeFromGroup, { groupId: ids.groupId, userId: ids.ben })).toBe(1);
  await t.run(async (ctx) => {
    expect((await ctx.db.get("groups", ids.groupId))!.memberIds).toEqual([ids.ana]);
  });
});
