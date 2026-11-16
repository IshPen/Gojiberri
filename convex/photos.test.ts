/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const llm = vi.hoisted(() => ({ visionJSON: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ ok: true, reason: "" })) }));
vi.mock("./llm", () => ({ chatJSON: vi.fn(async () => ({})), chatText: vi.fn(async () => ""), visionJSON: llm.visionJSON }));

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };
const CAFE = { lat: 37.4447235, lng: -122.1614973 };
const north = (m: number) => ({ lat: CAFE.lat + m / 111_195, lng: CAFE.lng });

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (name: string) =>
      ctx.db.insert("users", {
        name, budgetMax: 30, homeArea: "Stanford", diet: [], vibes: [],
        onboarded: true, points: 0, diamonds: 0, streak: 0, busyBlocks: [],
      });
    const ana = await user("Ana");
    const ben = await user("Ben");
    const placeId = await ctx.db.insert("places", {
      name: "Coupa Cafe", area: "Stanford", category: "food", priceLevel: 1, tags: ["coffee"], ...CAFE, durationMins: 45,
    });
    const groupId = await ctx.db.insert("groups", { name: "Crew", inviteCode: "CREW00", ownerId: ana, memberIds: [ana, ben] });
    const planId = await ctx.db.insert("plans", {
      groupId, window: { start: 0, end: 1 }, status: "locked", winningIndex: 0, confirmBy: 0,
      options: [{ placeId, title: "Coffee", costMin: 0, costMax: 10, why: "" }],
    });
    return { ana, ben, groupId, planId };
  });
  const store = () => t.run((ctx) => ctx.storage.store(new Blob(["x"])));
  const checkIn = async (coords: { lat?: number; lng?: number; accuracy?: number } = {}) =>
    await t.mutation(api.photos.savePhoto, { userId: ids.ana, storageId: await store(), planId: ids.planId, ...coords });
  const verify = async () => {
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const job = jobs.find((f) => f.name === "photos:verifyCheckin");
    if (!job) throw new Error("verifyCheckin was not scheduled");
    await t.action(internal.photos.verifyCheckin, job.args[0] as never);
  };
  const status = (photoId: Id<"photos">) => t.query(api.photos.getCheckinStatus, { photoId });
  const points = () => t.run(async (ctx) => (await ctx.db.get("users", ids.ana))!.points);
  const planEvents = () =>
    t.run(async (ctx) => (await ctx.db.query("pointEvents").collect()).filter((e) => e.userId === ids.ana && e.planId === ids.planId));
  const story = () => t.query(api.photos.getGroupStory, { groupId: ids.groupId });
  return { t, ids, store, checkIn, verify, status, points, planEvents, story };
}

beforeEach(() => {
  vi.useFakeTimers();
  llm.visionJSON.mockReset();
  llm.visionJSON.mockResolvedValue({ ok: true, reason: "Looks like a real photo" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("savePhoto check-in verification", () => {
  it("keeps the return shape and awards the same points with or without a location", async () => {
    const plain = await (await world()).checkIn();
    const w = await world();
    const located = await w.checkIn({ ...north(50), accuracy: 20 });
    expect(Object.keys(located).sort()).toEqual(["items", "photoId", "total", "verification"]);
    expect(located.verification).toBe("pending");
    expect(located.total).toBe(plain.total);
    expect(located.items).toEqual(plain.items);
    expect(located.total).toBeGreaterThan(0);
    expect(await w.points()).toBe(located.total);
    expect(await w.status(located.photoId)).toEqual({ status: "verifying", distanceM: 50 });
  });

  it("verifies a check-in within 300 m plus accuracy", async () => {
    const w = await world();
    const { photoId, total } = await w.checkIn({ ...north(350), accuracy: 80 });
    await w.verify();
    expect(await w.status(photoId)).toEqual({ status: "verified", distanceM: 350, cvOk: true });
    expect(await w.points()).toBe(total);
  });

  it("verifies on geo alone when the vision check errors", async () => {
    const w = await world();
    llm.visionJSON.mockRejectedValue(new Error("OpenAI vision request failed (500)"));
    const { photoId } = await w.checkIn(north(100));
    await w.verify();
    expect(await w.status(photoId)).toEqual({ status: "verified", distanceM: 100 });
  });

  it("soft mode labels a far check-in rejected but keeps the points and the story photo", async () => {
    const w = await world();
    const { photoId, total } = await w.checkIn(north(5000));
    await w.verify();
    expect(llm.visionJSON).not.toHaveBeenCalled();
    expect(await w.status(photoId)).toEqual({
      status: "rejected", reason: "You don't seem to be at Coupa Cafe", distanceM: 5000,
    });
    expect(await w.points()).toBe(total);
    expect((await w.story()).map((p) => p._id)).toEqual([photoId]);
  });

  it("strict mode refuses a far check-in before awarding anything", async () => {
    vi.stubEnv("CHECKIN_VERIFY", "strict");
    const w = await world();
    await expect(w.checkIn(north(5000))).rejects.toThrow("You don't seem to be at Coupa Cafe");
    expect(await w.points()).toBe(0);
    expect(await w.planEvents()).toHaveLength(0);
    expect(await w.t.run((ctx) => ctx.db.query("photos").collect())).toHaveLength(0);
  });

  it("strict mode still accepts a nearby check-in", async () => {
    vi.stubEnv("CHECKIN_VERIFY", "strict");
    const w = await world();
    const { photoId, total } = await w.checkIn(north(100));
    await w.verify();
    expect((await w.status(photoId))?.status).toBe("verified");
    expect(await w.points()).toBe(total);
  });

  it("verifies a check-in without a location when the vision check passes", async () => {
    const w = await world();
    const { photoId } = await w.checkIn();
    await w.verify();
    expect(llm.visionJSON).toHaveBeenCalledWith(
      expect.any(String), "They say they are at Coupa Cafe.", expect.any(String), 20_000,
    );
    expect(await w.status(photoId)).toEqual({ status: "verified", cvOk: true });
  });

  it("soft mode rejects a screenshot without a location but keeps the points", async () => {
    const w = await world();
    llm.visionJSON.mockResolvedValue({ ok: false, reason: "This looks like a screenshot" });
    const { photoId, total } = await w.checkIn();
    await w.verify();
    expect(await w.status(photoId)).toEqual({ status: "rejected", reason: "This looks like a screenshot", cvOk: false });
    expect(await w.points()).toBe(total);
    expect(await w.story()).toHaveLength(1);
  });

  it("marks a check-in unverified when there is no location and the vision check times out", async () => {
    const w = await world();
    llm.visionJSON.mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));
    const { photoId, total } = await w.checkIn();
    await w.verify();
    expect(await w.status(photoId)).toEqual({ status: "unverified", reason: "We couldn't check the location or the photo" });
    expect(await w.points()).toBe(total);
  });

  it("marks a check-in unverified when the vision check returns no verdict", async () => {
    const w = await world();
    llm.visionJSON.mockResolvedValue({ reason: "?" });
    const { photoId } = await w.checkIn();
    await w.verify();
    expect((await w.status(photoId))?.status).toBe("unverified");
  });

  it("strict mode reverses the award, hides the photo and lets the user check in again", async () => {
    vi.stubEnv("CHECKIN_VERIFY", "strict");
    const w = await world();
    llm.visionJSON.mockResolvedValue({ ok: false, reason: "This looks like a stock photo" });
    const { photoId, total } = await w.checkIn();
    expect(await w.points()).toBe(total);
    await w.verify();
    expect(await w.status(photoId)).toEqual({ status: "rejected", reason: "This looks like a stock photo", cvOk: false });
    expect(await w.points()).toBe(0);
    expect(await w.planEvents()).toHaveLength(0);
    expect(await w.story()).toEqual([]);
    expect(await w.t.run((ctx) => ctx.db.get("photos", photoId))).not.toBeNull();

    const retry = await w.checkIn();
    expect(retry.verification).toBe("pending");
    expect(retry.total).toBeGreaterThan(0);
  });

  it("skips planless photos and repeat check-ins", async () => {
    const w = await world();
    const planless = await w.t.mutation(api.photos.savePhoto, { userId: w.ids.ana, storageId: await w.store(), groupId: w.ids.groupId });
    expect(planless).toEqual({ photoId: planless.photoId, total: 0, items: [], verification: "skipped" });
    expect(await w.status(planless.photoId)).toBeNull();

    await w.checkIn();
    const repeat = await w.checkIn(north(10));
    expect(repeat).toEqual({ photoId: repeat.photoId, total: 0, items: [], verification: "skipped" });
    expect(await w.status(repeat.photoId)).toBeNull();
    const jobs = await w.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.filter((f) => f.name === "photos:verifyCheckin")).toHaveLength(1);
  });
});
