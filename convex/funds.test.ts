/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };

async function crew({ price = 20, confirmed = ["Ana", "Ben"], placeOnly = false } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (name: string) =>
      ctx.db.insert("users", {
        name, budgetMax: 30, homeArea: "Stanford", diet: [], vibes: [],
        onboarded: true, points: 0, diamonds: 0, streak: 0, busyBlocks: [],
      });
    const users: Record<string, Id<"users">> = { Ana: await user("Ana"), Ben: await user("Ben"), Cy: await user("Cy") };
    const businessId = await ctx.db.insert("businesses", { name: "Escape Co", earned: 0 });
    const experienceId = await ctx.db.insert("experiences", {
      businessId, title: "Escape room", description: "", pricePerPerson: price,
      minGroup: 1, maxGroup: 6, tags: [], active: true,
    });
    const placeId = await ctx.db.insert("places", {
      name: "Escape Co", area: "Stanford", category: "activity", priceLevel: 2, tags: [], lat: 0, lng: 0, durationMins: 60,
    });
    const groupId = await ctx.db.insert("groups", {
      name: "Crew", inviteCode: "CREW00", ownerId: users.Ana, memberIds: [users.Ana, users.Ben, users.Cy],
    });
    const planId = await ctx.db.insert("plans", {
      groupId, window: { start: 0, end: 1 }, status: "locked", winningIndex: 0, confirmBy: 0,
      options: [{ placeId, title: "Escape", costMin: 0, costMax: price, why: "", experienceId: placeOnly ? undefined : experienceId }],
    });
    for (const name of confirmed) {
      await ctx.db.insert("votes", { planId, userId: users[name], optionIndex: 0, confirmed: true });
    }
    await ctx.db.insert("votes", { planId, userId: users.Cy, optionIndex: 0, confirmed: false });
    const potId = await ctx.db.insert("pots", { groupId, balance: 0, monthlyContribution: 20 });
    await ctx.db.insert("cards", { groupId, last4: "4242", status: "mock-active" });
    return { users, businessId, groupId, planId, potId };
  });
  let payment = 0;
  const contribute = (name: string, amount: number) =>
    t.mutation(internal.funds.recordContribution, {
      potId: ids.potId, userId: ids.users[name], amount, whopPaymentId: `pay_${payment++}`,
    });
  const sponsor = (amount: number) =>
    t.run(async (ctx) => {
      const placeId = (await ctx.db.query("places").first())!._id;
      const sponsorId = await ctx.db.insert("sponsors", {
        business: "Boba Bar", offer: "", placeId, priceLevel: 1, tags: [], rewardCost: 1, payPerVisit: 1, active: true,
      });
      await ctx.runMutation(internal.pots.addSponsorChipIn, { potId: ids.potId, sponsorId, amount, planId: ids.planId });
    });
  const charge = () => t.mutation(api.cards.chargeCard, { userId: ids.users.Ana, groupId: ids.groupId, planId: ids.planId });
  const shares = async () =>
    Object.fromEntries((await t.query(api.funds.getPotShares, { groupId: ids.groupId })).map((s) => [s.name, s]));
  return { t, ids, contribute, sponsor, charge, shares };
}

describe("fair-split pot", () => {
  it("derives each member's share from their own contributions", async () => {
    const { contribute, sponsor, shares } = await crew();
    await contribute("Ana", 15);
    await contribute("Ben", 10);
    await contribute("Ana", 5);
    await sponsor(10);
    expect(await shares()).toMatchObject({
      Ana: { contributed: 20, spent: 0, balance: 20 },
      Ben: { contributed: 10, spent: 0, balance: 10 },
      Cy: { contributed: 0, spent: 0, balance: 0 },
    });
  });

  it("splits only among confirmed attendees and refuses while one is short, until they top up the gap", async () => {
    const { t, ids, contribute, charge, shares } = await crew();
    await contribute("Ana", 30);
    await contribute("Ben", 12);
    await contribute("Cy", 50);
    const split = await t.query(api.funds.getPlanSplit, { planId: ids.planId });
    expect(split).toMatchObject({ total: 40, sponsorCredit: 0, perPerson: 20, allCovered: false, charged: false });
    expect(split!.attendees.map((a) => [a.name, a.balance, a.shortBy])).toEqual([["Ana", 30, 0], ["Ben", 12, 8]]);

    const refused = await charge().catch((e) => e);
    expect(refused.data).toEqual({ code: "ATTENDEES_SHORT", attendees: [{ userId: ids.users.Ben, name: "Ben", shortBy: 8 }] });

    await contribute("Ben", 8);
    expect((await t.query(api.funds.getPlanSplit, { planId: ids.planId }))!.allCovered).toBe(true);
    const receipt = await charge();
    expect(receipt).toMatchObject({ amount: 40, people: 2, last4: "4242", balance: 60 });

    const rows = await t.run((ctx) => ctx.db.query("transactions").collect());
    const spends = rows.filter((r) => r.type === "spend");
    expect(spends.map((r) => [r.userId, r.amount, r.planId])).toEqual([
      [ids.users.Ana, 20, ids.planId],
      [ids.users.Ben, 20, ids.planId],
    ]);
    expect(await shares()).toMatchObject({
      Ana: { contributed: 30, spent: 20, balance: 10 },
      Ben: { contributed: 20, spent: 20, balance: 0 },
      Cy: { contributed: 50, spent: 0, balance: 50 },
    });
    const business = await t.run((ctx) => ctx.db.get("businesses", ids.businessId));
    expect(business!.earned).toBe(40);
    expect((await t.query(api.funds.getPlanSplit, { planId: ids.planId }))!.charged).toBe(true);
    await expect(charge()).rejects.toThrow("already paid");
  });

  it("lowers every attendee's share by the plan's sponsor credit and leaves leftovers with the payer", async () => {
    const { t, ids, contribute, sponsor, charge, shares } = await crew({ price: 25 });
    await contribute("Ana", 50);
    await contribute("Ben", 20);
    await sponsor(10);
    const split = await t.query(api.funds.getPlanSplit, { planId: ids.planId });
    expect(split).toMatchObject({ total: 50, sponsorCredit: 10, perPerson: 20, allCovered: true });

    await charge();
    const spends = (await t.run((ctx) => ctx.db.query("transactions").collect())).filter((r) => r.type === "spend");
    expect(spends.map((r) => [r.userId ?? null, r.amount])).toEqual([
      [ids.users.Ana, 20],
      [ids.users.Ben, 20],
      [null, 10],
    ]);
    expect(await shares()).toMatchObject({ Ana: { balance: 30 }, Ben: { balance: 0 } });
    expect((await t.run((ctx) => ctx.db.get("pots", ids.potId)))!.balance).toBe(30);
  });

  it("rounds an uneven split to the cent without over-collecting", async () => {
    const { t, ids, contribute, charge, shares } = await crew({ price: 10, confirmed: ["Ana", "Ben", "Cy"] });
    await contribute("Ana", 20);
    await contribute("Ben", 20);
    await contribute("Cy", 20);
    await t.run(async (ctx) => {
      const placeId = (await ctx.db.query("places").first())!._id;
      const sponsorId = await ctx.db.insert("sponsors", {
        business: "Boba Bar", offer: "", placeId, priceLevel: 1, tags: [], rewardCost: 1, payPerVisit: 1, active: true,
      });
      await ctx.runMutation(internal.pots.addSponsorChipIn, { potId: ids.potId, sponsorId, amount: 10, planId: ids.planId });
    });
    const split = await t.query(api.funds.getPlanSplit, { planId: ids.planId });
    expect(split).toMatchObject({ total: 30, sponsorCredit: 10, perPerson: 6.67 });
    expect(split!.attendees.map((a) => a.share)).toEqual([6.67, 6.67, 6.66]);
    await charge();
    expect(await shares()).toMatchObject({ Ana: { balance: 13.33 }, Ben: { balance: 13.33 }, Cy: { balance: 13.34 } });
    expect((await t.run((ctx) => ctx.db.get("pots", ids.potId)))!.balance).toBe(40);
  });

  it("returns null and refuses to charge when the winner isn't an experience", async () => {
    const { t, ids, contribute, charge } = await crew({ placeOnly: true });
    await contribute("Ana", 50);
    expect(await t.query(api.funds.getPlanSplit, { planId: ids.planId })).toBeNull();
    await expect(charge()).rejects.toThrow("isn't a bookable experience");
  });
  it("rounds every balance write to the cent", async () => {
    const { t, ids, contribute, shares } = await crew();
    await contribute("Ana", 10.11);
    await contribute("Ben", 10.11);
    await contribute("Cy", 12.12);
    expect((await t.run((ctx) => ctx.db.get("pots", ids.potId)))!.balance).toBe(32.34);
    expect((await shares()).Ana.balance).toBe(10.11);
  });

  it("counts one split charge as one booking and one admission per attendee", async () => {
    const { t, ids, contribute, sponsor, charge } = await crew({ price: 25 });
    await contribute("Ana", 50);
    await contribute("Ben", 50);
    await sponsor(10);
    await charge();
    const experienceId = (await t.query(api.funds.getPlanSplit, { planId: ids.planId }))!.experienceId;

    const stats = await t.query(api.businesses.businessStats, { businessId: ids.businessId });
    expect(stats.bookings).toBe(1);
    expect(stats.recentSales.map((s) => s.amount)).toEqual([50]);

    const code = await t.mutation(api.redemptions.createRedemptionCode, { userId: ids.users.Ana, kind: "experience", refId: experienceId });
    expect(await t.mutation(api.redemptions.redeemCode, { code: code.code, businessId: ids.businessId })).toMatchObject({ valid: true });
    await expect(
      t.mutation(api.redemptions.createRedemptionCode, { userId: ids.users.Ana, kind: "experience", refId: experienceId }),
    ).rejects.toThrow("already redeemed");
  });
});
