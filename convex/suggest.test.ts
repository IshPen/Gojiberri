/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { CAMPUS_CENTERS } from "./places";

const llm = vi.hoisted(() => ({ chatJSON: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})) }));

vi.mock("supermemory", () => ({
  Supermemory: class {
    add = vi.fn(async () => ({}));
    search = vi.fn(async () => ({ results: [] }));
    profile = vi.fn(async () => ({ profile: { static: [], dynamic: [] } }));
  },
}));
vi.mock("./llm", () => ({ chatJSON: llm.chatJSON, chatText: vi.fn() }));

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };

async function world({ seed = false } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (name: string) =>
      ctx.db.insert("users", {
        name, budgetMax: 40, homeArea: "Stanford", diet: [], vibes: ["nerdy"],
        onboarded: true, points: 50, diamonds: 0, streak: 0, busyBlocks: [],
      });
    const ana = await user("Ana");
    const ben = await user("Ben");
    const place = (name: string, tags: string[]) =>
      ctx.db.insert("places", {
        name, area: "Stanford", category: "activity", priceLevel: 1, tags,
        lat: CAMPUS_CENTERS.Stanford.lat, lng: CAMPUS_CENTERS.Stanford.lng, durationMins: 60,
      });
    const cafeId = await place("Cafe", ["cozy"]);
    const parkId = await place("Park", ["outdoors"]);
    const escapePlaceId = await place("Escape Co", []);
    const bowlPlaceId = await place("Bowl Co", []);
    const businessId = await ctx.db.insert("businesses", { name: "Fun Co", earned: 0 });
    const experience = (title: string, tags: string[], placeId: Id<"places">) =>
      ctx.db.insert("experiences", {
        businessId, title, description: "", pricePerPerson: 15, minGroup: 1, maxGroup: 6, tags, active: true, placeId,
      });
    const escapeId = await experience("Escape room", ["nerdy"], escapePlaceId);
    const bowlingId = await experience("Bowling", ["active"], bowlPlaceId);
    const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW00", ownerId: ana, memberIds: [ana, ben] });
    await ctx.db.insert("pots", { groupId, balance: 100, monthlyContribution: 20 });
    const planId = await ctx.db.insert("plans", {
      groupId, window: { start: Date.now() + 86_400_000, end: Date.now() + 90_000_000 }, status: "generating",
      confirmBy: 0, options: [], ...(seed ? { seedExperienceId: bowlingId } : {}),
    });
    return { cafeId, parkId, escapeId, bowlingId, planId };
  });
  const plan = () => t.run((ctx) => ctx.db.get("plans", ids.planId));
  return { t, ids, plan };
}

beforeEach(() => {
  llm.chatJSON.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("generateSuggestions saves one top pick", () => {
  it("keeps only the first valid LLM pick", async () => {
    const { t, ids, plan } = await world();
    llm.chatJSON.mockResolvedValue({
      options: [
        { id: "nope", title: "Made up", why: "x" },
        { id: ids.escapeId, title: "Escape room", why: "You love puzzles." },
        { id: ids.cafeId, title: "Cafe", why: "Cozy." },
      ],
    });
    await t.action(internal.suggest.generateSuggestions, { planId: ids.planId });
    const saved = await plan();
    expect(saved?.status).toBe("voting");
    expect(saved?.options).toHaveLength(1);
    expect(saved?.options[0]).toMatchObject({ experienceId: ids.escapeId, why: "You love puzzles." });
  });

  it("falls back to the best-matching experience when the LLM fails", async () => {
    const { t, ids, plan } = await world();
    llm.chatJSON.mockRejectedValue(new Error("OpenAI 500"));
    await t.action(internal.suggest.generateSuggestions, { planId: ids.planId });
    const saved = await plan();
    expect(saved?.options).toHaveLength(1);
    expect(saved?.options[0]).toMatchObject({ experienceId: ids.escapeId, title: "Escape room" });
  });

  it("falls back to a cheap place when every experience was rejected", async () => {
    const { t, ids, plan } = await world();
    llm.chatJSON.mockResolvedValue({ nonsense: true });
    await t.action(internal.suggest.generateSuggestions, {
      planId: ids.planId, excludeExperienceIds: [ids.escapeId, ids.bowlingId],
    });
    const saved = await plan();
    expect(saved?.options).toHaveLength(1);
    expect(saved?.options[0].experienceId).toBeUndefined();
  });

  it("makes the seed experience the single option, even when the LLM picks something else", async () => {
    const { t, ids, plan } = await world({ seed: true });
    llm.chatJSON.mockResolvedValue({ options: [{ id: ids.escapeId, title: "Escape room", why: "x" }] });
    await t.action(internal.suggest.generateSuggestions, { planId: ids.planId });
    const saved = await plan();
    expect(saved?.options).toHaveLength(1);
    expect(saved?.options[0]).toMatchObject({ experienceId: ids.bowlingId, title: "Bowling" });
  });

  it("uses the LLM's why for the seed when it picks the seed", async () => {
    const { t, ids, plan } = await world({ seed: true });
    llm.chatJSON.mockResolvedValue({ options: [{ id: ids.bowlingId, title: "Bowling", why: "Strikes all round." }] });
    await t.action(internal.suggest.generateSuggestions, { planId: ids.planId });
    const saved = await plan();
    expect(saved?.options).toHaveLength(1);
    expect(saved?.options[0]).toMatchObject({ experienceId: ids.bowlingId, why: "Strikes all round." });
  });

  it("drops a rejected seed and picks the next best", async () => {
    const { t, ids, plan } = await world({ seed: true });
    llm.chatJSON.mockRejectedValue(new Error("OpenAI 500"));
    await t.action(internal.suggest.generateSuggestions, { planId: ids.planId, excludeExperienceIds: [ids.bowlingId] });
    const saved = await plan();
    expect(saved?.options).toHaveLength(1);
    expect(saved?.options[0].experienceId).toBe(ids.escapeId);
  });

  it("ignores a stale generation", async () => {
    const { t, ids, plan } = await world();
    llm.chatJSON.mockRejectedValue(new Error("OpenAI 500"));
    await t.action(internal.suggest.generateSuggestions, { planId: ids.planId, generation: 1 });
    const saved = await plan();
    expect(saved?.status).toBe("generating");
    expect(saved?.options).toHaveLength(0);
  });
});
