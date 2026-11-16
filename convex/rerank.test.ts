/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { CAMPUS_CENTERS } from "./places";
import { applyRerank, MAX_MOVE } from "./rerank";
import { localDate } from "./time";

type Hit = { id: string; memory: string; similarity: number; metadata: Record<string, unknown> };
type SearchArgs = { query: string; limit?: number; filter?: { field: string; operator: string; value: string } };

const sm = vi.hoisted(() => ({
  add: vi.fn(async (..._args: unknown[]) => ({})),
  search: vi.fn(async (..._args: unknown[]) => ({ results: [] as unknown[] })),
  profile: vi.fn(async () => ({ profile: { static: [], dynamic: [] } })),
}));
const llm = vi.hoisted(() => ({ chatJSON: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})) }));

vi.mock("supermemory", () => ({
  Supermemory: class {
    add = sm.add;
    search = sm.search;
    profile = sm.profile;
  },
}));
vi.mock("./llm", () => ({ chatJSON: llm.chatJSON, chatText: vi.fn() }));

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };
const today = localDate(Date.now());
const near = (km: number) => ({ lat: CAMPUS_CENTERS.Stanford.lat + km / 111.2, lng: CAMPUS_CENTERS.Stanford.lng });

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (name: string) =>
      ctx.db.insert("users", {
        name, budgetMax: 40, homeArea: "Stanford", diet: [], vibes: ["cozy", "boba"],
        onboarded: true, points: 0, diamonds: 0, streak: 0, busyBlocks: [],
      });
    const ana = await user("Ana");
    const ben = await user("Ben");
    const place = (name: string, category: string, tags: string[], km = 1) =>
      ctx.db.insert("places", { name, area: "Stanford", category, priceLevel: 1, tags, ...near(km), durationMins: 60 });
    const bobaId = await place("Boba Bar", "food", ["boba", "quick"]);
    const museumId = await place("Museum", "arts", ["museum", "free"], 2);
    const climbId = await place("Climbing Gym", "activity", ["climbing"], 3);
    for (let i = 0; i < 9; i++) await place(`Cafe ${i}`, "food", ["cozy", i % 2 ? "coffee" : "study-spot"], 1 + i / 2);
    const businessId = await ctx.db.insert("businesses", { name: "Escape Co", earned: 0 });
    const escapeId = await ctx.db.insert("experiences", {
      businessId, title: "Escape room", description: "", pricePerPerson: 15,
      minGroup: 1, maxGroup: 6, tags: ["nerdy", "group-friendly"], active: true, placeId: climbId,
    });
    const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW00", ownerId: ana, memberIds: [ana, ben] });
    const lockedPlanId = await ctx.db.insert("plans", {
      groupId, window: { start: 0, end: 1 }, status: "locked", winningIndex: 0, confirmBy: 0,
      options: [{ placeId: climbId, title: "Escape room", costMin: 0, costMax: 15, why: "", experienceId: escapeId }],
    });
    return { ana, ben, bobaId, museumId, climbId, escapeId, groupId, lockedPlanId };
  });
  const scheduled = () =>
    t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((f) => ({ name: f.name, args: f.args })));
  return { t, ids, scheduled };
}

const added = () => sm.add.mock.calls.map(([tag, body]) => ({ tag, ...(body as { content: string; metadata: Record<string, unknown> }) }));

beforeEach(() => {
  sm.add.mockReset().mockResolvedValue({});
  sm.search.mockReset().mockResolvedValue({ results: [] });
  llm.chatJSON.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("memory writes carry metadata", () => {
  it("tags a swipe with kind, category, the chosen side's tags and time", async () => {
    const { t, ids } = await world();
    await t.action(api.memory.rememberSwipe, { userId: ids.ana, chosen: "Climbing gym", rejected: "Mini golf", category: "activity" });
    expect(added()).toEqual([
      {
        tag: `user_${ids.ana}`,
        content: "Prefers Climbing gym over Mini golf (activity).",
        dreaming: "instant",
        metadata: { kind: "swipe", category: "activity", tags: ["climbing", "bouldering", "active"], at: expect.any(Number) },
      },
    ]);
  });

  it("tags preferences with the user's vibes", async () => {
    const { t, ids } = await world();
    await t.action(internal.memory.rememberPreferences, { userId: ids.ana });
    expect(added()[0].metadata).toEqual({ kind: "preferences", tags: ["cozy", "boba"], at: expect.any(Number) });
  });

  it("tags a rating with stars, place, experience, category and tags on both containers", async () => {
    const { t, ids } = await world();
    const ratingId = await t.run((ctx) => ctx.db.insert("ratings", { userId: ids.ana, planId: ids.lockedPlanId, stars: 5, vibe: "fun" }));
    await t.action(internal.memory.rememberRating, { ratingId });
    const meta = {
      kind: "rating", stars: 5, placeId: ids.climbId, experienceId: ids.escapeId, category: "activity",
      tags: ["nerdy", "group-friendly", "climbing"], at: expect.any(Number),
    };
    expect(added().map((a) => [a.tag, a.metadata])).toEqual([
      [`user_${ids.ana}`, meta],
      [`group_${ids.groupId}`, meta],
    ]);
  });

  it("writes one pass memory per rejected idea with its metadata", async () => {
    const { t, ids } = await world();
    await t.action(internal.memory.rememberRejection, { groupId: ids.groupId, userIds: [ids.ana], titles: ["Museum", "Escape room"] });
    const calls = added();
    expect(calls).toHaveLength(4);
    expect(calls).toContainEqual(expect.objectContaining({
      tag: `user_${ids.ana}`,
      content: "Passed on Museum: not interested.",
      metadata: { kind: "pass", placeId: ids.museumId, category: "arts", tags: ["museum", "free"], at: expect.any(Number) },
    }));
    expect(calls).toContainEqual(expect.objectContaining({
      tag: `group_${ids.groupId}`,
      content: "Ana passed on Escape room.",
      metadata: expect.objectContaining({ kind: "pass", experienceId: ids.escapeId, placeId: ids.climbId, category: "activity" }),
    }));
  });

  it("savePhoto keeps its return and schedules a check-in memory with metadata", async () => {
    const { t, ids, scheduled } = await world();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    const result = await t.mutation(api.photos.savePhoto, { userId: ids.ana, storageId, planId: ids.lockedPlanId, caption: "we escaped" });
    expect(Object.keys(result).sort()).toEqual(["items", "photoId", "total", "verification"]);
    const job = (await scheduled()).find((f) => f.name === "memory:rememberCheckin");
    expect(job?.args).toEqual([{ photoId: result.photoId }]);

    await t.action(internal.memory.rememberCheckin, { photoId: result.photoId });
    expect(added()).toEqual([
      expect.objectContaining({ tag: `user_${ids.ana}`, content: 'Checked in at Escape room with the crew: "we escaped"' }),
      expect.objectContaining({ tag: `group_${ids.groupId}`, content: 'Ana checked in at Escape room: "we escaped"' }),
    ]);
    expect(added()[0].metadata).toEqual({
      kind: "checkin", placeId: ids.climbId, experienceId: ids.escapeId, category: "activity",
      tags: ["nerdy", "group-friendly", "climbing"], at: expect.any(Number),
    });
  });

  it("does not schedule a check-in memory for a photo outside a plan", async () => {
    const { t, ids, scheduled } = await world();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    await t.mutation(api.photos.savePhoto, { userId: ids.ana, storageId });
    expect((await scheduled()).map((f) => f.name)).not.toContain("memory:rememberCheckin");
  });
});

const ideas = Array.from({ length: 12 }, (_, i) => ({
  key: `place:${i}`,
  title: `Idea ${i}`,
  category: ["food", "arts", "activity", "outdoors"][i % 4],
  tags: [`tag${i}`, "shared"],
}));

describe("memory.contextForIdeas", () => {
  it("runs bounded searches, filters categories and returns capped, deduped context", async () => {
    const { t, ids } = await world();
    sm.search.mockImplementation(async (...args: unknown[]) => {
      const [tag, { query, filter }] = args as [string, SearchArgs];
      const hit = (memory: string, similarity: number, tags: string[] = []): Hit => ({ id: memory, memory, similarity, metadata: { tags } });
      const results: Hit[] = [
        hit("Loves cozy spots.", 0.9),
        hit("loves  COZY spots", 0.5),
        hit(`${tag} note for ${query}`.padEnd(400, "!"), 0.4),
        ...(filter ? [hit(`Rated a ${filter.value} spot 5 stars.`, 0.8, ["tag0", "tag4"])] : []),
        ...Array.from({ length: 5 }, (_, i) => hit(`About ${query} #${i}`, 0.3 - i / 100)),
      ];
      return { results };
    });
    const res = await t.action(internal.memory.contextForIdeas, { userId: ids.ana, groupId: ids.groupId, ideas });

    expect(sm.search.mock.calls.length).toBeLessThanOrEqual(10);
    const filters = sm.search.mock.calls.flatMap(([, body]) => ((body as SearchArgs).filter ? [(body as SearchArgs).filter] : []));
    expect(filters).toContainEqual({ field: "category", operator: "eq", value: "food" });
    expect(Object.keys(res.byIdea).sort()).toEqual(ideas.map((i) => i.key).sort());
    for (const list of Object.values(res.byIdea)) {
      expect(list.length).toBeLessThanOrEqual(3);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(res.general.length).toBeLessThanOrEqual(5);
    const everything = [...Object.values(res.byIdea).flat(), ...res.general];
    expect(everything.every((m) => m.length <= 200)).toBe(true);
    expect(everything.filter((m) => m.toLowerCase().includes("cozy"))).toHaveLength(1);
    expect(res.general.some((m) => Object.values(res.byIdea).flat().includes(m))).toBe(false);
    expect(res.byIdea["place:0"]).toContain("Rated a food spot 5 stars.");
    expect(res.byIdea["place:4"]).toContain("Rated a food spot 5 stars.");
    expect(res.byIdea["place:8"]).not.toContain("Rated a food spot 5 stars.");
    expect(res.general).toContain("Loves cozy spots.");
    expect(res.byIdea["place:11"]).toEqual([]);
  });

  it("returns empty context when there is no container or Supermemory fails", async () => {
    const { t, ids } = await world();
    expect(await t.action(internal.memory.contextForIdeas, { ideas: ideas.slice(0, 2) })).toEqual({
      byIdea: { "place:0": [], "place:1": [] }, general: [],
    });
    sm.search.mockRejectedValue(new Error("down"));
    expect((await t.action(internal.memory.contextForIdeas, { userId: ids.ana, ideas: ideas.slice(0, 2) })).general).toEqual([]);
  });
});

const slots = ["safe", "safe", "stretch"] as const;
const candidates = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    key: `place:${i}`, title: `Idea ${i}`, category: "food", tags: [`tag${i}`], baseScore: 1 - i / 100, slot: slots[i % 3],
  }));
const reply = (keys: string[], reason = (k: string) => `You liked ${k}.`) => ({ ideas: keys.map((key) => ({ key, reason: reason(key) })) });

function shuffled<T>(items: T[], seed: number) {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("applyRerank limits", () => {
  it("never moves an item more than 3 places and keeps the safe/stretch slot at every position", () => {
    const base = candidates(14);
    for (let seed = 1; seed <= 300; seed++) {
      const order = shuffled(base.slice(0, 10).map((c) => c.key), seed);
      const result = applyRerank(base, reply(order));
      expect(result.map((r) => r.rank)).toEqual(base.map((_, i) => i + 1));
      expect(new Set(result.map((r) => r.key)).size).toBe(base.length);
      result.forEach((r, i) => {
        const from = base.findIndex((c) => c.key === r.key);
        expect(Math.abs(from - i)).toBeLessThanOrEqual(MAX_MOVE);
        expect(base[from].slot).toBe(base[i].slot);
      });
      expect(result.slice(10).map((r) => r.key)).toEqual(base.slice(10).map((c) => c.key));
    }
  });

  it("follows the model where it can: a full reversal only moves items 3 places", () => {
    const base = candidates(10);
    const result = applyRerank(base, reply(base.map((c) => c.key).reverse()));
    expect(result[0].key).toBe("place:3");
    expect(result.find((r) => r.key === "place:9")!.rank).toBeGreaterThanOrEqual(7);
  });

  it("keeps only second-person reasons", () => {
    const base = candidates(4);
    const result = applyRerank(base, {
      ideas: [
        { key: "place:1", reason: "  You rated boba 5 stars." },
        { key: "place:0", reason: "Ana loves this." },
        { key: "place:2", reason: 42 },
        { key: "nope", reason: "You?" },
        { key: "place:3", reason: `Your crew ${"x".repeat(300)}` },
      ],
    });
    const reasons = Object.fromEntries(result.map((r) => [r.key, r.reason]));
    expect(reasons["place:1"]).toBe("You rated boba 5 stars.");
    expect(reasons["place:0"]).toBeNull();
    expect(reasons["place:2"]).toBeNull();
    expect(reasons["place:3"]!.length).toBeLessThanOrEqual(160);
    expect(result.map((r) => r.reason).filter(Boolean).every((r) => /^you/i.test(r!))).toBe(true);
  });

  it("throws on a reply without known ideas so the caller falls back", () => {
    expect(() => applyRerank(candidates(3), { order: [] })).toThrow();
    expect(() => applyRerank(candidates(3), reply(["x"]))).toThrow();
  });
});

describe("rerank.rerankForUser", () => {
  const withMemories = () =>
    sm.search.mockImplementation(async (...args: unknown[]) => ({
      results: (args[1] as SearchArgs).query.startsWith("Idea 2")
        ? [{ id: "m1", memory: "Rated Idea 2 five stars.", similarity: 0.9, metadata: {} }]
        : [],
    }));

  it("reranks with grounded reasons, caches per user and day, and reuses the cache", async () => {
    const { t, ids } = await world();
    withMemories();
    llm.chatJSON.mockResolvedValue(reply(["place:2", "place:1", "place:0", "place:3", "place:4"]));
    const args = { userId: ids.ana, day: today, candidates: candidates(5) };
    const first = await t.action(internal.rerank.rerankForUser, args);
    expect(first[0]).toEqual({ key: "place:1", rank: 1, reason: "You liked place:1." });
    expect(first.find((r) => r.key === "place:2")!.rank).toBe(3);
    const [system, input] = llm.chatJSON.mock.calls[0] as [string, { ideas: { memories: string[] }[] }];
    expect(system).toContain('starting with "You"');
    expect(input.ideas.some((i) => i.memories.includes("Rated Idea 2 five stars."))).toBe(true);

    const order = await t.query(api.rerank.getForYouOrder, { userId: ids.ana, day: today });
    expect(order?.result).toEqual(first);
    expect(order?.groupId).toBeNull();

    const again = await t.action(internal.rerank.rerankForUser, args);
    expect(again).toEqual(first);
    expect(llm.chatJSON).toHaveBeenCalledTimes(1);
    expect(await t.query(api.rerank.getForYouOrder, { userId: ids.ana, day: "2000-01-01" })).toBeNull();
  });

  it("falls back to the base order with null reasons when the model fails, and caches nothing", async () => {
    const { t, ids } = await world();
    withMemories();
    llm.chatJSON.mockRejectedValue(new Error("OpenAI 500"));
    const base = candidates(4).map((c, i) => ({ key: c.key, rank: i + 1, reason: null }));
    const args = { userId: ids.ana, day: today, candidates: candidates(4) };
    expect(await t.action(internal.rerank.rerankForUser, args)).toEqual(base);
    llm.chatJSON.mockResolvedValue({ nonsense: true });
    expect(await t.action(internal.rerank.rerankForUser, args)).toEqual(base);
    expect(await t.query(api.rerank.getForYouOrder, { userId: ids.ana, day: today })).toBeNull();
  });

  it("skips the model when Supermemory has nothing to ground reasons in", async () => {
    const { t, ids } = await world();
    const result = await t.action(internal.rerank.rerankForUser, { userId: ids.ana, day: today, candidates: candidates(3) });
    expect(result.every((r) => r.reason === null)).toBe(true);
    expect(llm.chatJSON).not.toHaveBeenCalled();
  });
});

describe("rerank.requestForYou", () => {
  it("schedules a rerank of recs.forYou's top 10 and skips it once the cache matches", async () => {
    const { t, ids, scheduled } = await world();
    expect(await t.mutation(api.rerank.requestForYou, { userId: ids.ana, day: today })).toEqual({ scheduled: true });
    const job = (await scheduled()).find((f) => f.name === "rerank:rerankForUser");
    const args = job!.args[0] as { userId: Id<"users">; day: string; candidates: ReturnType<typeof candidates> };
    const feed = await t.query(api.recs.forYou, { userId: ids.ana, day: today, limit: 10 });
    expect(args.candidates.map((c) => c.key)).toEqual(feed.map((r) => `${r.kind === "experience" ? "exp" : "place"}:${r.id}`));
    expect(args.candidates.map((c) => c.slot)).toEqual(feed.map((r) => r.slot));
    expect(args.candidates.find((c) => c.key === `place:${ids.bobaId}`)?.category).toBe("food");

    withMemoriesFor();
    llm.chatJSON.mockResolvedValue(reply(args.candidates.map((c) => c.key)));
    await t.action(internal.rerank.rerankForUser, args);
    expect(await t.mutation(api.rerank.requestForYou, { userId: ids.ana, day: today })).toEqual({ scheduled: false });
    expect(await t.mutation(api.rerank.requestForYou, { userId: ids.ana, groupId: ids.groupId, day: today })).toEqual({ scheduled: true });
  });
});

function withMemoriesFor() {
  sm.search.mockResolvedValue({ results: [{ id: "m", memory: "Loves boba.", similarity: 0.7, metadata: {} }] });
}
