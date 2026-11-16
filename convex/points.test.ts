/// <reference types="vite/client" />

import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { leaderboardWeekStart, weekStartPT } from "./points";

vi.mock("supermemory", () => ({
  Supermemory: class {
    add = vi.fn(async () => ({}));
    search = vi.fn(async () => ({ results: [] }));
    profile = vi.fn(async () => ({ profile: { static: [], dynamic: [] } }));
  },
}));

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };

async function board() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ana", budgetMax: 40, homeArea: "Stanford", diet: [], vibes: [],
      onboarded: true, points: 50, diamonds: 0, streak: 0, busyBlocks: [],
    });
    const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW00", ownerId: userId, memberIds: [userId] });
    await ctx.db.insert("pointEvents", { userId, reason: "checkin", points: 50, groupId });
  });
  const crews = await t.query(api.points.groupLeaderboard, { limit: 10 });
  const schools = await t.query(api.points.schoolLeaderboard, { limit: 10 });
  return { crew: crews[0]?.avgPoints, school: schools[0]?.avgPoints };
}

describe("LEADERBOARD_WEEK_START override", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses an ISO date or epoch ms as the week start", () => {
    const now = Date.parse("2026-11-16T09:00:00Z");
    vi.stubEnv("LEADERBOARD_WEEK_START", "2026-11-09T08:00:00Z");
    expect(leaderboardWeekStart(now)).toBe(Date.parse("2026-11-09T08:00:00Z"));
    vi.stubEnv("LEADERBOARD_WEEK_START", "1762675200000");
    expect(leaderboardWeekStart(now)).toBe(1762675200000);
  });

  it("falls back to Monday PT when unset or invalid", () => {
    const now = Date.parse("2026-11-16T09:00:00Z");
    vi.stubEnv("LEADERBOARD_WEEK_START", "");
    expect(leaderboardWeekStart(now)).toBe(weekStartPT(now));
    vi.stubEnv("LEADERBOARD_WEEK_START", "not a date");
    expect(leaderboardWeekStart(now)).toBe(weekStartPT(now));
  });

  it("counts this week's points with no override", async () => {
    expect(await board()).toEqual({ crew: 50, school: 50 });
  });

  it("counts points with an invalid override", async () => {
    vi.stubEnv("LEADERBOARD_WEEK_START", "garbage");
    expect(await board()).toEqual({ crew: 50, school: 50 });
  });

  it("excludes points before an override in the future", async () => {
    vi.stubEnv("LEADERBOARD_WEEK_START", String(Date.now() + 3_600_000));
    expect(await board()).toEqual({ crew: 0, school: 0 });
  });

  it("includes points after an override in the past", async () => {
    vi.stubEnv("LEADERBOARD_WEEK_START", new Date(Date.now() - 30 * 86_400_000).toISOString());
    expect(await board()).toEqual({ crew: 50, school: 50 });
  });
});
