/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { CAMPUS_CENTERS } from "./places";
import { computeTaste, TasteInput } from "./taste";
import { addDays, localDate } from "./time";

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };

type Persona = Pick<Doc<"users">, "name" | "budgetMax" | "homeArea" | "diet" | "vibes">;
type Spot = { name: string; tags: string[]; priceLevel?: number; category?: string; km?: number; at?: { lat: number; lng: number } };
type Offer = { title: string; price: number; tags: string[]; km?: number; minGroup?: number; maxGroup?: number };

const KM_PER_DEG_LAT = 111.2;
const today = localDate(Date.now());
const DAY_MS = 24 * 60 * 60 * 1000;

type Taste = Partial<Omit<TasteInput, "user">>;
const profileOf = (persona: Persona, taste: Taste = {}) =>
  computeTaste({ user: persona, swipes: [], ratings: [], passes: [], checkins: [], ...taste });

function world(persona: Persona) {
  const t = convexTest(schema, modules);
  const campus = CAMPUS_CENTERS[persona.homeArea];
  const north = (km = 1) => ({ lat: campus.lat + km / KM_PER_DEG_LAT, lng: campus.lng });
  const ids: Record<string, Id<"places"> | Id<"experiences">> = {};

  const setup = async ({ spots = [], offers = [], taste }: { spots?: Spot[]; offers?: Offer[]; taste?: Taste }) =>
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        ...persona, onboarded: true, points: 0, diamonds: 0, streak: 0, busyBlocks: [],
      });
      if (taste) await ctx.db.insert("tasteProfiles", { userId, ...profileOf(persona, taste), updatedAt: Date.now() });
      for (const s of spots) {
        ids[s.name] = await ctx.db.insert("places", {
          name: s.name, area: persona.homeArea, category: s.category ?? "activity", priceLevel: s.priceLevel ?? 1,
          tags: s.tags, ...(s.at ?? north(s.km)), durationMins: 60,
        });
      }
      const businessId = await ctx.db.insert("businesses", { name: "Partner Co", earned: 0 });
      for (const o of offers) {
        const placeId = await ctx.db.insert("places", {
          name: `${o.title} venue`, area: persona.homeArea, category: "activity", priceLevel: 2, tags: [],
          ...north(o.km), durationMins: 60,
        });
        ids[o.title] = await ctx.db.insert("experiences", {
          businessId, title: o.title, description: "", placeId, pricePerPerson: o.price,
          minGroup: o.minGroup ?? 1, maxGroup: o.maxGroup ?? 10, tags: o.tags, active: true,
        });
      }
      return userId;
    });

  const feed = (userId: Id<"users">, extra: { day?: string; limit?: number; groupId?: Id<"groups"> } = {}) =>
    t.query(api.recs.forYou, { userId, day: today, limit: 50, ...extra });

  const pastPlan = (userId: Id<"users">, placeName: string, outcome: { checkin?: boolean; stars?: number }) =>
    t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW01", ownerId: userId, memberIds: [userId] });
      const planId = await ctx.db.insert("plans", {
        groupId, window: { start: 0, end: 1 }, status: "done", winningIndex: 0, confirmBy: 0,
        options: [{ placeId: ids[placeName] as Id<"places">, title: placeName, costMin: 0, costMax: 10, why: "" }],
      });
      if (outcome.checkin) await ctx.db.insert("pointEvents", { userId, reason: "checkin", points: 10, planId, groupId });
      if (outcome.stars) await ctx.db.insert("ratings", { userId, planId, stars: outcome.stars, vibe: "meh" });
    });

  return { t, ids, setup, feed, pastPlan };
}

const titles = (recs: { title: string }[]) => recs.map((r) => r.title);

describe("recs.forYou", () => {
  it("keeps a vegetarian on a $20 budget within budget and near campus, with the fitting partner first", async () => {
    const w = world({ name: "Vera", budgetMax: 20, homeArea: "Stanford", diet: ["vegetarian"], vibes: ["cozy", "arts"] });
    const userId = await w.setup({
      taste: {},
      offers: [
        { title: "Veg supper club", price: 18, tags: ["cozy", "vegetarian-friendly"] },
        { title: "Tasting menu", price: 45, tags: ["cozy", "vegetarian-friendly"] },
      ],
      spots: [
        { name: "Cozy café", tags: ["cozy", "coffee"], km: 1 },
        { name: "Steakhouse", tags: ["cozy"], priceLevel: 3 },
        { name: "Far cozy café", tags: ["cozy", "coffee"], km: 12 },
        { name: "Out of town café", tags: ["cozy", "coffee"], km: 40 },
      ],
    });
    const recs = await w.feed(userId);
    const names = titles(recs);

    expect(names).not.toContain("Tasting menu");
    expect(names).not.toContain("Steakhouse");
    expect(names).not.toContain("Out of town café");
    expect(recs.every((r) => (r.pricePerPerson ?? 0) <= 20)).toBe(true);
    expect(recs[0]).toMatchObject({ kind: "experience", title: "Veg supper club", partner: true, slot: "safe", businessName: "Partner Co" });
    expect(recs[0].reason).toBe("You like cozy, it's vegetarian friendly and it's 1 km from campus");
    expect(names.indexOf("Cozy café")).toBeLessThan(names.indexOf("Far cozy café"));
    expect(recs.find((r) => r.title === "Far cozy café")!.distanceKm).toBeCloseTo(12, 0);
  });

  it("lifts a fitting partner above a slightly better non-partner, but never over budget or a disliked tag (no profile, vibes fallback)", async () => {
    const w = world({ name: "Max", budgetMax: 20, homeArea: "Stanford", diet: [], vibes: ["climbing", "music"] });
    const userId = await w.setup({
      offers: [
        { title: "Partner climb night", price: 20, tags: ["climbing"], km: 6 },
        { title: "Pricey partner climb", price: 21, tags: ["climbing", "music"], km: 1 },
        { title: "Partner karaoke", price: 5, tags: ["music", "karaoke"], km: 1 },
      ],
      spots: [
        { name: "Crag gym", tags: ["climbing"], km: 1 },
        { name: "Loud bar", tags: ["karaoke", "loud"], km: 2 },
        { name: "Record shop", tags: ["music", "records"], km: 2 },
      ],
    });
    await w.pastPlan(userId, "Loud bar", { stars: 1 });
    const names = titles(await w.feed(userId));

    expect(names.indexOf("Partner climb night")).toBeLessThan(names.indexOf("Crag gym"));
    expect(names).not.toContain("Pricey partner climb");
    expect(names).not.toContain("Partner karaoke");
    expect(names).not.toContain("Loud bar");
    expect(names).toContain("Record shop");
  });

  it("filters a crew feed on max(budgetMax, pot share), lets the pot share drive the reason, and respects crew size", async () => {
    const w = world({ name: "Pat", budgetMax: 20, homeArea: "Stanford", diet: [], vibes: ["games"] });
    const userId = await w.setup({
      taste: {},
      offers: [
        { title: "Cheap game night", price: 8, tags: ["games"] },
        { title: "Board game café", price: 18, tags: ["games"] },
        { title: "Arcade pass", price: 25, tags: ["games"] },
        { title: "Big group escape room", price: 8, tags: ["games"], minGroup: 4 },
      ],
    });
    const { groupId, friend } = await w.t.run(async (ctx) => {
      const friend = await ctx.db.insert("users", {
        name: "Fran", budgetMax: 20, homeArea: "Stanford", diet: [], vibes: [], onboarded: true, points: 0, diamonds: 0, streak: 0, busyBlocks: [],
      });
      const groupId = await ctx.db.insert("groups", { name: "Duo", inviteCode: "DUO001", ownerId: userId, memberIds: [userId, friend] });
      const potId = await ctx.db.insert("pots", { groupId, balance: 10, monthlyContribution: 20 });
      await ctx.db.insert("transactions", { potId, type: "contribution", amount: 10, userId, status: "completed" });
      return { groupId, friend };
    });

    const crewFeed = await w.feed(userId, { groupId });
    expect(titles(crewFeed.filter((r) => r.kind === "experience")).sort()).toEqual(["Board game café", "Cheap game night"]);
    expect(crewFeed.find((r) => r.title === "Cheap game night")!.reason).toBe("You like games, your pot share covers it and it's 1 km from campus");
    expect(crewFeed.find((r) => r.title === "Board game café")!.reason).toBe("You like games and it's 1 km from campus");

    const neverChippedIn = titles(await w.feed(friend, { groupId }));
    expect(neverChippedIn).toEqual(expect.arrayContaining(["Cheap game night", "Board game café"]));
    expect(neverChippedIn).not.toContain("Arcade pass");
  });

  it("ranks by the taste profile's weights and drops its disliked tags", async () => {
    const persona = { name: "Tia", budgetMax: 20, homeArea: "Stanford", diet: [], vibes: ["cozy"] };
    const w = world(persona);
    const climbSwipe = { chosenTags: ["climbing"], rejectedTags: [] };
    const taste: Taste = {
      swipes: [climbSwipe, climbSwipe, climbSwipe],
      ratings: [{ stars: 1, tags: ["karaoke"] }, { stars: 1, tags: ["karaoke"] }],
    };
    expect(profileOf(persona, taste).dislikedTags).toEqual(["karaoke"]);
    const userId = await w.setup({
      taste,
      spots: [
        { name: "Cozy café", tags: ["cozy", "coffee"], km: 1 },
        { name: "Climbing gym", tags: ["climbing", "social"], km: 1 },
        { name: "Karaoke bar", tags: ["karaoke", "cozy"], km: 1 },
      ],
    });
    const recs = await w.feed(userId);

    expect(titles(recs)).toEqual(["Climbing gym", "Cozy café"]);
  });

  it("uses the profile's category history for stretch novelty", async () => {
    const persona = { name: "Ola", budgetMax: 20, homeArea: "Stanford", diet: [], vibes: ["active", "social"] };
    const w = world(persona);
    const userId = await w.setup({
      taste: {
        checkins: [
          { tags: [], category: "outdoors", at: Date.now() },
          ...[1, 2, 3].map((i) => ({ tags: [], category: "arts", at: Date.now() - (60 + i) * DAY_MS })),
        ],
      },
      spots: [
        { name: "Rec center", tags: ["active", "social"], km: 1 },
        { name: "Run club", tags: ["active", "social"], km: 1 },
        { name: "Trail run", tags: ["active", "trails"], category: "outdoors", km: 1 },
        { name: "Dance studio", tags: ["active", "dance"], category: "arts", km: 1 },
        { name: "Salsa dinner", tags: ["active", "salsa"], category: "food", km: 1 },
      ],
    });
    const recs = await w.feed(userId, { limit: 3 });

    expect(recs.map((r) => r.slot)).toEqual(["safe", "safe", "stretch"]);
    expect(recs[2].title).toBe("Salsa dinner");
  });

  describe("a climber at Berkeley", () => {
    const cleo = { name: "Cleo", budgetMax: 30, homeArea: "Berkeley", diet: [], vibes: ["climbing", "active"] };
    const climber = () => world(cleo);
    const taste: Taste = { swipes: [{ chosenTags: ["climbing", "active"], rejectedTags: ["karaoke"] }] };
    const spots: Spot[] = [
      { name: "Bouldering gym", tags: ["climbing", "active", "social"], priceLevel: 2, km: 1 },
      { name: "Fire trail", tags: ["hiking", "active", "views"], category: "outdoors", km: 2 },
      { name: "Rock park", tags: ["climbing", "bouldering", "views", "sunset", "free"], category: "outdoors", km: 3 },
      { name: "Yoga loft", tags: ["active", "stretching", "wellness", "calm"], priceLevel: 2, km: 1 },
      { name: "Campus café", tags: ["coffee", "cozy"], category: "food", km: 1 },
      { name: "Art museum", tags: ["art", "museum"], category: "arts", km: 1 },
      { name: "Pizza spot", tags: ["pizza", "cheap-eats"], category: "food", km: 1 },
      { name: "Record store", tags: ["records", "music"], category: "arts", km: 2 },
      { name: "Climbing wall", tags: ["climbing", "active"], priceLevel: 2, km: 9 },
      { name: "Slackline meetup", tags: ["active", "slackline", "social"], category: "outdoors", km: 2 },
      { name: "Kayak club", tags: ["active", "kayaking", "water", "social"], category: "outdoors", priceLevel: 2, km: 6 },
    ];

    it("makes every third pick a stretch: the most novel item that still fits", async () => {
      const w = climber();
      const userId = await w.setup({ spots, taste });
      const recs = await w.feed(userId, { limit: 9 });
      const weights = profileOf(cleo, taste).tagWeights;
      const vibes = new Set(Object.keys(weights).filter((tag) => weights[tag] > 0));
      const unfamiliar = (tags: string[]) => tags.filter((tag) => !vibes.has(tag)).length / tags.length;

      expect(recs.map((r) => r.slot)).toEqual(["safe", "safe", "stretch", "safe", "safe", "stretch", "safe", "safe", "safe"]);
      for (const [i, rec] of recs.entries()) {
        if (rec.slot !== "stretch") continue;
        expect(rec.tags.some((tag) => vibes.has(tag))).toBe(true);
        expect(rec.reason).toMatch(/^Something new for you: .+\. You like (climbing|active) and it's \d+ km from campus$/);
        const laterFitting = recs.slice(i + 1).filter((r) => r.tags.some((tag) => vibes.has(tag)));
        for (const other of laterFitting) expect(unfamiliar(rec.tags)).toBeGreaterThanOrEqual(unfamiliar(other.tags));
      }
      expect(recs[0].reason).toMatch(/^You like climbing and active and it's 1 km from campus$/);
    });

    it("demotes a spot checked into in the last 14 days, then brings it back", async () => {
      const w = climber();
      const userId = await w.setup({ spots, taste });
      expect((await w.feed(userId))[0].title).toBe("Bouldering gym");

      await w.pastPlan(userId, "Bouldering gym", { checkin: true });
      const now = await w.feed(userId);
      expect(now[0].title).not.toBe("Bouldering gym");
      expect(titles(now).indexOf("Bouldering gym")).toBeGreaterThan(2);

      expect((await w.feed(userId, { day: addDays(today, 20) }))[0].title).toBe("Bouldering gym");
    });

    it("rotates near-equal picks day to day, deterministically", async () => {
      const w = world({ name: "Rex", budgetMax: 20, homeArea: "Berkeley", diet: [], vibes: ["games"] });
      const userId = await w.setup({
        spots: Array.from({ length: 8 }, (_, i) => ({ name: `Game café ${i}`, tags: ["games"], km: 1 })),
      });
      const orderOn = async (day: string) => titles(await w.feed(userId, { day, limit: 8 })).join("|");

      expect(await orderOn(today)).toBe(await orderOn(today));
      const week = await Promise.all(Array.from({ length: 7 }, (_, i) => orderOn(addDays(today, i))));
      expect(new Set(week).size).toBeGreaterThan(1);
      expect(new Set(week.map((order) => order.split("|")[0])).size).toBeGreaterThan(1);
    });
  });

  it("centers a USF student's feed on the USF campus", async () => {
    const w = world({ name: "Uri", budgetMax: 20, homeArea: "USF", diet: [], vibes: ["thrift", "boba"] });
    const userId = await w.setup({
      spots: [
        { name: "Haight thrift", tags: ["thrift", "vintage"], km: 0.5 },
        { name: "Richmond boba", tags: ["boba", "dessert"], km: 2 },
        { name: "Palo Alto boba", tags: ["boba"], at: CAMPUS_CENTERS.Stanford },
      ],
    });
    const recs = await w.feed(userId);

    expect(titles(recs)).not.toContain("Palo Alto boba");
    expect(recs.find((r) => r.title === "Haight thrift")!.distanceKm).toBeCloseTo(0.5, 1);
    expect(recs.every((r) => r.distanceKm !== null && r.distanceKm <= 25)).toBe(true);
    expect(recs[0].reason).toContain("km from campus");
  });
});
