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

it("rewriteDemoCopy swaps exact old copy, is idempotent, and leaves other rows alone", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const placeId = await ctx.db.insert("places", {
      name: "The Guild Theatre", area: "Stanford", category: "arts", priceLevel: 2, tags: ["live-music"], lat: 0, lng: 0, durationMins: 150,
    });
    const businessId = await ctx.db.insert("businesses", { name: "The Guild Theatre", earned: 0 });
    const experience = (title: string, description: string) =>
      ctx.db.insert("experiences", {
        businessId, placeId, title, description, pricePerPerson: 26, minGroup: 2, maxGroup: 8, tags: ["live-music"], active: true,
      });
    const music = await experience(
      "Demo: Crew music night",
      "Fictional demo package based on the real Guild Theatre in Menlo Park. The $26 price and group booking are not venue offers; check the venue calendar for actual tickets and age restrictions.",
    );
    const partial = await experience("Demo: Crew music night!", "Crew music night");
    const sponsor = await ctx.db.insert("sponsors", {
      business: "The Guild Theatre", offer: "Demo only: $10 into your crew's pot for music night. Fictional sponsorship, not a venue offer.",
      placeId, priceLevel: 2, tags: ["live-music"], rewardCost: 1, payPerVisit: 5, active: true,
    });
    const other = await ctx.db.insert("sponsors", {
      business: "Cafe", offer: "10% off any drink today", placeId, priceLevel: 1, tags: [], rewardCost: 1, payPerVisit: 2, active: true,
    });
    const ana = await ctx.db.insert("users", {
      name: "Ana", budgetMax: 30, homeArea: "Stanford", diet: [], vibes: [], onboarded: true, points: 0, diamonds: 0, streak: 0, busyBlocks: [],
    });
    const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW00", ownerId: ana, memberIds: [ana] });
    const planId = await ctx.db.insert("plans", {
      groupId, window: { start: 0, end: 1 }, status: "locked", winningIndex: 0, confirmBy: 0,
      options: [
        { placeId, title: "The Guild Theatre", costMin: 26, costMax: 26, why: "Your crew loved music night. Demo package with a fictional $10 sponsor chip-in, not a venue offer.", experienceId: music },
        { placeId, title: "Arizona Garden", costMin: 0, costMax: 0, why: "A free garden walk on the Stanford campus." },
      ],
    });
    return { music, partial, sponsor, other, placeId, businessId, planId };
  });

  expect(await t.mutation(internal.admin.rewriteDemoCopy, {})).toEqual({ experiences: 1, sponsors: 1, businesses: 0, places: 0, plans: 1 });
  expect(await t.mutation(internal.admin.rewriteDemoCopy, {})).toEqual({ experiences: 0, sponsors: 0, businesses: 0, places: 0, plans: 0 });

  await t.run(async (ctx) => {
    const music = (await ctx.db.get("experiences", ids.music))!;
    expect(music.title).toBe("Crew music night");
    expect(music.description).not.toMatch(/demo|fictional/i);
    expect(music.pricePerPerson).toBe(26);
    expect(music.tags).toEqual(["live-music"]);
    const partial = (await ctx.db.get("experiences", ids.partial))!;
    expect(partial.title).toBe("Demo: Crew music night!");
    expect(partial.description).toBe("Crew music night");
    expect((await ctx.db.get("sponsors", ids.sponsor))!.offer).toBe("$10 into your crew's pot for music night at the Guild.");
    expect((await ctx.db.get("sponsors", ids.other))!.offer).toBe("10% off any drink today");
    expect((await ctx.db.get("places", ids.placeId))!.name).toBe("The Guild Theatre");
    expect((await ctx.db.get("businesses", ids.businessId))!.name).toBe("The Guild Theatre");
    const plan = (await ctx.db.get("plans", ids.planId))!;
    expect(plan.options.map((o) => o.why)).toEqual([
      "Your crew loved music night, and the Guild is chipping $10 into your pot.",
      "A free garden walk on the Stanford campus.",
    ]);
    expect(plan.options[0].experienceId).toBe(ids.music);
  });
});

it("rewriteDemoCopy fixes stale experience titles snapshotted into plan options", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const placeId = await ctx.db.insert("places", {
      name: "Pizza My Heart - Palo Alto", area: "Stanford", category: "food", priceLevel: 1, tags: [], lat: 0, lng: 0, durationMins: 45,
    });
    const ana = await ctx.db.insert("users", {
      name: "Ana", budgetMax: 30, homeArea: "Stanford", diet: [], vibes: [], onboarded: true, points: 0, diamonds: 0, streak: 0, busyBlocks: [],
    });
    const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW00", ownerId: ana, memberIds: [ana] });
    const plan = (options: { title: string; why: string }[]) =>
      ctx.db.insert("plans", {
        groupId, window: { start: 0, end: 1 }, status: "voting", confirmBy: 0,
        options: options.map((o) => ({ placeId, costMin: 9, costMax: 9, ...o })),
      });
    const stale = await plan([
      { title: "Demo: Pizza study break", why: "Cheap slices." },
      { title: "Pizza My Heart - Palo Alto", why: "A crew favorite." },
    ]);
    const clean = await plan([{ title: "Demo: Pizza study break (late)", why: "Cheap slices." }]);
    return { stale, clean };
  });

  expect(await t.mutation(internal.admin.rewriteDemoCopy, {})).toMatchObject({ plans: 1 });
  expect(await t.mutation(internal.admin.rewriteDemoCopy, {})).toMatchObject({ plans: 0 });

  await t.run(async (ctx) => {
    const stale = (await ctx.db.get("plans", ids.stale))!;
    expect(stale.options.map((o) => [o.title, o.why])).toEqual([
      ["Pizza study break", "Cheap slices."],
      ["Pizza My Heart - Palo Alto", "A crew favorite."],
    ]);
    expect((await ctx.db.get("plans", ids.clean))!.options[0].title).toBe("Demo: Pizza study break (late)");
  });
});

it("patchPlan patches only the given fields and keeps votes when reopening voting", async () => {
  const { t, ids } = await setup();
  expect(await t.mutation(internal.admin.patchPlan, { planId: ids.planId, confirmBy: 5000 })).toEqual({ status: "done", confirmBy: 5000 });
  expect(await t.mutation(internal.admin.patchPlan, { planId: ids.planId, status: "voting" })).toEqual({ status: "voting", confirmBy: 5000 });
  await t.run(async (ctx) => {
    const plan = (await ctx.db.get("plans", ids.planId))!;
    expect(plan.winningIndex).toBe(0);
    expect(await ctx.db.query("votes").withIndex("by_plan", (q) => q.eq("planId", ids.planId)).collect()).toHaveLength(2);
    expect((await ctx.db.get("plans", ids.otherPlanId))!.confirmBy).toBe(0);
  });
});
