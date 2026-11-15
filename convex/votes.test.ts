/// <reference types="vite/client" />

import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

vi.mock("supermemory", () => ({
  Supermemory: class {
    add = vi.fn(async () => ({}));
    search = vi.fn(async () => ({ results: [] }));
    profile = vi.fn(async () => ({ profile: { static: [], dynamic: [] } }));
  },
}));

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };

async function plan(memberCount: number) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const members: Id<"users">[] = [];
    for (let i = 0; i < memberCount; i++) {
      members.push(
        await ctx.db.insert("users", {
          name: `User ${i}`, budgetMax: 40, homeArea: "Stanford", diet: [], vibes: [],
          onboarded: true, points: 50, diamonds: 0, streak: 0, busyBlocks: [],
        }),
      );
    }
    const placeId = await ctx.db.insert("places", {
      name: "Cafe", area: "Stanford", category: "food", priceLevel: 1, tags: [], lat: 0, lng: 0, durationMins: 60,
    });
    const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW00", ownerId: members[0], memberIds: members });
    const planId = await ctx.db.insert("plans", {
      groupId, window: { start: Date.now() + 86_400_000, end: Date.now() + 90_000_000 }, status: "voting",
      confirmBy: Date.now() + 3_600_000, options: [{ placeId, title: "Cafe", costMin: 0, costMax: 10, why: "" }],
    });
    return { members, planId };
  });
  const go = (i: number) => t.mutation(api.votes.castVote, { userId: ids.members[i], planId: ids.planId, optionIndex: 0 });
  const out = (i: number) => t.mutation(api.votes.rejectOptions, { userId: ids.members[i], planId: ids.planId });
  const status = async () => (await t.run((ctx) => ctx.db.get("plans", ids.planId)))?.status;
  return { t, ids, go, out, status };
}

describe("one-pick plans: going vs not feeling it", () => {
  it("regenerates once half of 4 members opt out", async () => {
    const { out, status } = await plan(4);
    expect(await out(0)).toMatchObject({ ok: true, regenerated: false, rejects: 1, members: 4 });
    expect(await out(1)).toMatchObject({ ok: true, regenerated: true, rejects: 2, members: 4, regenCount: 1, generation: 1 });
    expect(await status()).toBe("generating");
  });

  it("doesn't regenerate on 1 of 3, does on 2 of 3", async () => {
    const { out, status } = await plan(3);
    expect(await out(0)).toMatchObject({ ok: true, regenerated: false, rejects: 1, members: 3 });
    expect(await status()).toBe("voting");
    expect(await out(1)).toMatchObject({ ok: true, regenerated: true, rejects: 2, members: 3 });
    expect(await status()).toBe("generating");
  });

  it("with 4 members, 2 going and 2 out regenerates instead of locking", async () => {
    const { go, out, status } = await plan(4);
    expect(await go(0)).toEqual({ locked: false });
    expect(await go(1)).toEqual({ locked: false });
    expect(await out(2)).toMatchObject({ regenerated: false });
    expect(await out(3)).toMatchObject({ regenerated: true });
    expect(await status()).toBe("generating");
  });

  it("locks when a majority is going", async () => {
    const { go, out, status } = await plan(3);
    await out(2);
    expect(await go(0)).toEqual({ locked: false });
    expect(await go(1)).toEqual({ locked: true });
    expect(await status()).toBe("locked");
    expect(await out(2)).toMatchObject({ ok: false, reason: "not_voting" });
  });

  it("rejects a vote for anything but the single option", async () => {
    const { t, ids } = await plan(3);
    await expect(
      t.mutation(api.votes.castVote, { userId: ids.members[0], planId: ids.planId, optionIndex: 1 }),
    ).rejects.toThrow("Invalid option");
  });
});
