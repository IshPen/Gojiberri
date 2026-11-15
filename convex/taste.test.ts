/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { computeTaste, TasteInput } from "./taste";

vi.mock("supermemory", () => ({
  Supermemory: class {
    add = vi.fn(async () => ({}));
    search = vi.fn(async () => ({ results: [] }));
    profile = vi.fn(async () => ({ profile: { static: [], dynamic: [] } }));
  },
}));

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };

const noUser: TasteInput["user"] = { vibes: [], diet: [], budgetMax: 20 };
const empty: TasteInput = { user: noUser, swipes: [], ratings: [], passes: [], checkins: [] };

describe("computeTaste weights", () => {
  it("weights a swipe +1 on the chosen side and -0.5 on the rejected side", () => {
    const taste = computeTaste({ ...empty, swipes: [{ chosenTags: ["boba"], rejectedTags: ["coffee"] }] });
    expect(taste.tagWeights).toEqual({ boba: 1, coffee: -0.5 });
  });

  it("weights preference vibes +2 and keeps diet as a constraint, not a weight", () => {
    const taste = computeTaste({ ...empty, user: { vibes: ["Cozy", "active"], diet: ["vegetarian"], budgetMax: 25 } });
    expect(taste.tagWeights).toEqual({ cozy: 2, active: 2 });
    expect(taste.dietConstraints).toEqual(["vegetarian"]);
    expect(taste.budgetMax).toBe(25);
  });

  it("weights a rating (stars - 3) x 0.75 on the rated idea's tags", () => {
    const taste = computeTaste({
      ...empty,
      ratings: [{ stars: 5, tags: ["climbing"] }, { stars: 1, tags: ["karaoke"] }, { stars: 3, tags: ["pizza"] }],
    });
    expect(taste.tagWeights).toEqual({ climbing: 1.5, karaoke: -1.5 });
  });

  it("weights a pass -0.5 on the rejected option's tags", () => {
    const taste = computeTaste({ ...empty, passes: [{ tags: ["museum", "art"] }, { tags: ["museum"] }] });
    expect(taste.tagWeights).toEqual({ museum: -1, art: -0.5 });
  });

  it("weights a check-in +0.5 and counts its category with the latest time", () => {
    const taste = computeTaste({
      ...empty,
      checkins: [
        { tags: ["boba"], category: "food", at: 100 },
        { tags: ["boba", "views"], category: "food", at: 50 },
        { tags: ["hiking"], category: "outdoors", at: 70 },
      ],
    });
    expect(taste.tagWeights).toEqual({ boba: 1, views: 0.5, hiking: 0.5 });
    expect(taste.categoryCounts).toEqual({ food: 2, outdoors: 1 });
    expect(taste.lastCategoryAt).toEqual({ food: 100, outdoors: 70 });
  });

  it("clamps weights to [-5, 5]", () => {
    const taste = computeTaste({
      ...empty,
      ratings: Array.from({ length: 5 }, () => ({ stars: 5, tags: ["boba"] })),
      passes: Array.from({ length: 12 }, () => ({ tags: ["bar"] })),
    });
    expect(taste.tagWeights).toEqual({ boba: 5, bar: -5 });
  });

  it("counts a tag as disliked at -2 or below", () => {
    const taste = computeTaste({
      ...empty,
      passes: [...Array(4).fill({ tags: ["at"] }), ...Array(3).fill({ tags: ["above"] }), ...Array(5).fill({ tags: ["below"] })],
    });
    expect(taste.tagWeights).toEqual({ at: -2, above: -1.5, below: -2.5 });
    expect(taste.dislikedTags).toEqual(["at", "below"]);
  });
});

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (name: string) =>
      ctx.db.insert("users", {
        name, budgetMax: 20, homeArea: "Stanford", diet: [], vibes: ["cozy"],
        onboarded: true, points: 50, diamonds: 0, streak: 0, busyBlocks: [],
      });
    const ana = await user("Ana");
    const ben = await user("Ben");
    const cy = await user("Cy");
    const place = (name: string, category: string, tags: string[]) =>
      ctx.db.insert("places", { name, area: "Stanford", category, priceLevel: 1, tags, lat: 0, lng: 0, durationMins: 60 });
    const bobaId = await place("Boba Bar", "food", ["boba", "quick"]);
    const museumId = await place("Museum", "arts", ["museum", "free"]);
    const climbId = await place("Climbing Gym", "activity", ["climbing"]);
    const businessId = await ctx.db.insert("businesses", { name: "Escape Co", earned: 0 });
    const escapeId = await ctx.db.insert("experiences", {
      businessId, title: "Escape room", description: "", pricePerPerson: 15,
      minGroup: 1, maxGroup: 6, tags: ["nerdy", "group-friendly"], active: true, placeId: climbId,
    });
    const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW00", ownerId: ana, memberIds: [ana, ben, cy] });
    const option = (placeId: Id<"places">, title: string, experienceId?: Id<"experiences">) =>
      ({ placeId, title, costMin: 0, costMax: 10, why: "", experienceId });
    const lockedPlanId = await ctx.db.insert("plans", {
      groupId, window: { start: 0, end: 1 }, status: "locked", winningIndex: 0, confirmBy: 0,
      options: [option(bobaId, "Boba")],
    });
    const votingPlanId = await ctx.db.insert("plans", {
      groupId, window: { start: 0, end: 1 }, status: "voting", confirmBy: Date.now() + 3_600_000,
      options: [option(museumId, "Museum"), option(climbId, "Escape", escapeId)],
    });
    return { ana, ben, cy, bobaId, museumId, climbId, escapeId, groupId, lockedPlanId, votingPlanId };
  });
  const profile = (userId: Id<"users">) => t.query(api.taste.getMyTaste, { userId });
  const scheduled = () =>
    t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((f) => f.name));
  return { t, ids, profile, scheduled };
}

describe("taste.rebuild", () => {
  it("builds the profile from preferences, ratings, passes and check-ins", async () => {
    const { t, ids, profile } = await world();
    await t.run(async (ctx) => {
      await ctx.db.insert("ratings", { userId: ids.ana, planId: ids.lockedPlanId, stars: 5, vibe: "cozy" });
      await ctx.db.insert("pointEvents", { userId: ids.ana, reason: "checkin", points: 10, planId: ids.lockedPlanId });
      await ctx.db.insert("pointEvents", { userId: ids.ana, reason: "reject_spend", points: -10, planId: ids.votingPlanId });
      await ctx.db.patch("plans", ids.votingPlanId, { rejectedBy: [ids.ana] });
    });
    await t.mutation(internal.taste.rebuild, { userId: ids.ana });
    const taste = await profile(ids.ana);
    expect(taste?.tagWeights).toEqual({
      cozy: 2,
      boba: 2, quick: 2,
      museum: -0.5, free: -0.5,
      nerdy: -0.5, "group-friendly": -0.5,
    });
    expect(taste?.categoryCounts).toEqual({ food: 1 });
    expect(taste?.budgetMax).toBe(20);
  });

  it("is idempotent", async () => {
    const { t, ids } = await world();
    await t.run(async (ctx) => {
      await ctx.db.insert("ratings", { userId: ids.ana, planId: ids.lockedPlanId, stars: 1, vibe: "meh" });
      await ctx.db.insert("swipes", {
        userId: ids.ana, chosen: "Karaoke", rejected: "Mini golf", category: "activity",
        chosenTags: ["karaoke"], rejectedTags: ["classic"], at: 1,
      });
    });
    const rows = () =>
      t.run(async (ctx) => (await ctx.db.query("tasteProfiles").collect()).map(({ _id, _creationTime, updatedAt: _updatedAt, ...rest }) => rest));
    await t.mutation(internal.taste.rebuild, { userId: ids.ana });
    const first = await rows();
    await t.mutation(internal.taste.rebuild, { userId: ids.ana });
    await t.mutation(internal.taste.rebuild, { userId: ids.ana });
    expect(await rows()).toEqual(first);
    expect(first).toHaveLength(1);
  });

  it("backfillAll schedules a rebuild for every user", async () => {
    const { t, ids, profile } = await world();
    vi.useFakeTimers();
    expect(await t.mutation(internal.taste.backfillAll, {})).toBe(3);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const userId of [ids.ana, ids.ben, ids.cy]) expect((await profile(userId))?.tagWeights).toEqual({ cozy: 2 });
    vi.useRealTimers();
  });
});

describe("taste hooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in taste tests"); }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("memory.rememberSwipe writes a swipe row and rebuilds the profile", async () => {
    const { t, ids, profile } = await world();
    const result = await t.action(api.memory.rememberSwipe, {
      userId: ids.ana, chosen: "Climbing gym", rejected: "Mini golf", category: "activity",
    });
    expect(result).toBeNull();
    const swipes = await t.run((ctx) => ctx.db.query("swipes").collect());
    expect(swipes).toMatchObject([{ userId: ids.ana, chosen: "Climbing gym", rejected: "Mini golf", category: "activity" }]);
    expect((await profile(ids.ana))?.tagWeights).toEqual({
      cozy: 2, climbing: 1, bouldering: 1, active: 1, classic: -0.5, retro: -0.5, "group-friendly": -0.5,
    });
  });

  it("users.updatePreferences schedules a rebuild", async () => {
    const { t, ids, profile, scheduled } = await world();
    await t.mutation(api.users.updatePreferences, {
      userId: ids.ana, budgetMax: 35, homeArea: "Stanford", diet: ["vegan"], vibes: ["active"],
    });
    expect(await scheduled()).toContain("taste:rebuild");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await profile(ids.ana)).toMatchObject({ tagWeights: { active: 2 }, dietConstraints: ["vegan"], budgetMax: 35 });
  });

  it("ratings.submitRating schedules a rebuild", async () => {
    const { t, ids, profile, scheduled } = await world();
    await t.mutation(api.ratings.submitRating, { userId: ids.ben, planId: ids.lockedPlanId, stars: 1, vibe: "meh" });
    expect(await scheduled()).toContain("taste:rebuild");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await profile(ids.ben))?.tagWeights).toEqual({ cozy: 2, boba: -1.5, quick: -1.5 });
  });

  it("votes.rejectOptions schedules a rebuild that penalizes the passed options", async () => {
    const { t, ids, profile, scheduled } = await world();
    const result = await t.mutation(api.votes.rejectOptions, { userId: ids.cy, planId: ids.votingPlanId });
    expect(result).toMatchObject({ ok: true, regenerated: false });
    expect(await scheduled()).toContain("taste:rebuild");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await profile(ids.cy))?.tagWeights).toEqual({
      cozy: 2, museum: -0.5, free: -0.5, nerdy: -0.5, "group-friendly": -0.5,
    });
  });

  it("photos.savePhoto schedules a rebuild that counts the check-in", async () => {
    const { t, ids, profile, scheduled } = await world();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["photo"])));
    await t.mutation(api.photos.savePhoto, { userId: ids.ana, storageId, planId: ids.lockedPlanId });
    expect(await scheduled()).toContain("taste:rebuild");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const taste = await profile(ids.ana);
    expect(taste?.tagWeights).toEqual({ cozy: 2, boba: 0.5, quick: 0.5 });
    expect(taste?.categoryCounts).toEqual({ food: 1 });
    expect(taste?.lastCategoryAt.food).toBeGreaterThan(0);
  });
});
