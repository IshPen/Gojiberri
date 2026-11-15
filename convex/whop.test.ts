/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = { ...import.meta.glob("./**/*.ts"), ...import.meta.glob("./_generated/*.js") };
const secret = "ws_synthetic_test_secret";
const now = 1_800_000_000_000;
const money = (amount: string) => ({ amount, currency: "usd", decimals: 2, display_decimals: 2 });

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Synthetic buyer", budgetMax: 30, homeArea: "Stanford", diet: [], vibes: [],
      onboarded: true, points: 0, diamonds: 0, streak: 0, busyBlocks: [],
    });
    const businessId = await ctx.db.insert("businesses", { name: "Synthetic business", earned: 7 });
    const experienceId = await ctx.db.insert("experiences", {
      businessId, title: "Synthetic experience", description: "Fixture only", pricePerPerson: 25.5,
      minGroup: 1, maxGroup: 4, tags: [], whopPlanId: "plan_fixture", active: true,
    });
    const groupId = await ctx.db.insert("groups", {
      name: "Synthetic crew", inviteCode: "TEST00", ownerId: userId, memberIds: [userId],
    });
    const potId = await ctx.db.insert("pots", { groupId, balance: 40, monthlyContribution: 20 });
    const purchaseId = await ctx.db.insert("experiencePurchases", {
      userId, experienceId, businessId, groupId, quantity: 1, amount: 25.5, currency: "usd",
      whopPlanId: "plan_fixture", whopCheckoutId: "ch_fixture", status: "pending",
    });
    return { userId, businessId, experienceId, groupId, potId, purchaseId };
  });
  const event = {
    type: "payment.succeeded", api_version: "v1", api_version_date: "2026-11-14-1",
    account_id: "biz_fixture",
    data: {
      id: "pay_fixture", status: "paid", substatus: "succeeded", currency: "usd", account_id: "biz_fixture",
      checkout_configuration_id: "ch_fixture", variant_id: "plan_fixture",
      metadata: { kind: "experience", purchaseId: ids.purchaseId },
      subtotal: money("25.50"), total: money("25.50"), tax_amount: null, tax_behavior: null,
      line_items: [{ variant_id: "plan_fixture", quantity: 1, subtotal: money("25.50") }],
    },
  };
  const state = () => t.run(async (ctx) => ({
    purchase: await ctx.db.get("experiencePurchases", ids.purchaseId),
    business: await ctx.db.get("businesses", ids.businessId),
    pot: await ctx.db.get("pots", ids.potId),
    transactions: await ctx.db.query("transactions").collect(),
  }));
  return { t, ids, event, state };
}

async function signed(body: string, timestamp = String(now / 1000), version = "v1", keySecret = secret) {
  const keyBytes = keySecret.startsWith("whsec_")
    ? Uint8Array.from(atob(keySecret.slice(6)), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(keySecret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`msg_fixture.${timestamp}.${body}`));
  return {
    "webhook-id": "msg_fixture", "webhook-timestamp": timestamp,
    "webhook-signature": `${version},${btoa(String.fromCharCode(...new Uint8Array(signature)))}`,
  };
}

beforeEach(() => {
  vi.stubEnv("WHOP_MOCK", undefined);
  vi.stubEnv("CONVEX_SITE_URL", "https://fixture.convex.site");
  vi.stubEnv("WHOP_COMPANY_ID", "biz_fixture");
  vi.stubEnv("WHOP_WEBHOOK_SECRET", secret);
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in webhook tests"); }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("experience fulfillment", () => {
  it("records a verified payment atomically without changing the fund", async () => {
    const { t, event, state } = await fixture();
    const body = JSON.stringify(event);
    expect((await t.fetch("/whop/webhook", { method: "POST", body, headers: await signed(body) })).status).toBe(200);
    const result = await state();
    expect(result.purchase).toMatchObject({ status: "completed", whopPaymentId: "pay_fixture", amount: 25.5 });
    expect(result.business?.earned).toBe(32.5);
    expect(result.pot?.balance).toBe(40);
    expect(result.transactions).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["exclusive", "inclusive"])("excludes fees and handles %s tax without crediting it", async (behavior) => {
    const { t, event, state } = await fixture();
    const data = { ...event.data, tax_amount: money("2.55"), tax_behavior: behavior,
      total: money(behavior === "exclusive" ? "28.05" : "25.50"), amount_charged: money("31.00") };
    await t.action(internal.whop.handleEvent, { event: { ...event, data } });
    expect((await state()).business?.earned).toBe(32.5);
  });

  it("deduplicates replay and never downgrades a completed purchase", async () => {
    const { t, event, state } = await fixture();
    await t.action(internal.whop.handleEvent, { event });
    const completed = await state();
    await t.action(internal.whop.handleEvent, { event });
    await t.action(internal.whop.handleEvent, { event: { ...event, data: { ...event.data,
      id: "pay_second", checkout_configuration_id: "ch_other" } } });
    expect(await state()).toEqual(completed);
  });

  it("deduplicates simultaneous deliveries in the purchase mutation", async () => {
    const { t, event, state } = await fixture();
    await Promise.all([
      t.action(internal.whop.handleEvent, { event }),
      t.action(internal.whop.handleEvent, { event }),
    ]);
    expect((await state()).business?.earned).toBe(32.5);
    expect((await state()).transactions).toEqual([]);
  });

  it("ignores user and experience metadata in favor of the server snapshot", async () => {
    const { t, ids, event, state } = await fixture();
    await t.action(internal.whop.handleEvent, { event: { ...event, data: { ...event.data,
      metadata: { ...event.data.metadata, userId: "untrusted", experienceId: "untrusted", amount: "999" } } } });
    expect((await state()).purchase).toMatchObject({ userId: ids.userId, experienceId: ids.experienceId, amount: 25.5 });
    expect((await state()).business?.earned).toBe(32.5);
  });

  it("does not complete or reserve a payment when the snapshot business is missing", async () => {
    const { t, ids, event, state } = await fixture();
    await t.run((ctx) => ctx.db.delete("businesses", ids.businessId));
    await t.action(internal.whop.handleEvent, { event });
    const result = await state();
    expect(result.purchase?.status).toBe("failed");
    expect(result.purchase?.whopPaymentId).toBeUndefined();
    expect(result.purchase?.completedAt).toBeUndefined();
    expect(result.pot?.balance).toBe(40);
    expect(result.transactions).toEqual([]);
  });

  it("preserves a completed purchase replay after its business is deleted", async () => {
    const { t, ids, event, state } = await fixture();
    await t.action(internal.whop.handleEvent, { event });
    const completed = (await state()).purchase;
    await t.run((ctx) => ctx.db.delete("businesses", ids.businessId));
    await t.action(internal.whop.handleEvent, { event });
    expect((await state()).purchase).toEqual(completed);
  });

  it("allows a matching payment after a mismatched pending attempt", async () => {
    const { t, event, state } = await fixture();
    await t.action(internal.whop.handleEvent, { event: { ...event, data: { ...event.data,
      subtotal: money("20.00"), total: money("20.00"),
      line_items: [{ variant_id: "plan_fixture", quantity: 1, subtotal: money("20.00") }] } } });
    expect((await state()).purchase?.status).toBe("failed");
    await t.action(internal.whop.handleEvent, { event });
    expect((await state()).purchase?.status).toBe("completed");
    expect((await state()).business?.earned).toBe(32.5);
  });

  it("prevents one payment from completing a different purchase", async () => {
    const { t, ids, event, state } = await fixture();
    await t.action(internal.whop.handleEvent, { event });
    const otherId = await t.run(async (ctx) => {
      const purchase = (await ctx.db.get("experiencePurchases", ids.purchaseId))!;
      const { _id, _creationTime, whopPaymentId: _payment, completedAt: _completed, ...pending } = purchase;
      return ctx.db.insert("experiencePurchases", { ...pending, status: "pending" });
    });
    await t.action(internal.whop.handleEvent, { event: { ...event, data: { ...event.data,
      metadata: { kind: "experience", purchaseId: otherId } } } });
    expect((await t.run((ctx) => ctx.db.get("experiencePurchases", otherId)))?.status).toBe("pending");
    expect((await state()).business?.earned).toBe(32.5);
  });

  it("binds a raced checkout only through the matching variant", async () => {
    const { t, ids, event, state } = await fixture();
    await t.run((ctx) => ctx.db.patch("experiencePurchases", ids.purchaseId, { whopCheckoutId: undefined }));
    await t.action(internal.whop.handleEvent, { event });
    expect((await state()).purchase).toMatchObject({ status: "completed", whopCheckoutId: "ch_fixture" });
  });

  it("returns HTTP 500 for unbound fulfillment so the provider can retry", async () => {
    const { t, ids, event, state } = await fixture();
    await t.run((ctx) => ctx.db.patch("experiencePurchases", ids.purchaseId, { whopCheckoutId: undefined }));
    const body = JSON.stringify({ ...event, data: { ...event.data, variant_id: null } });
    expect((await t.fetch("/whop/webhook", { method: "POST", body, headers: await signed(body) })).status).toBe(500);
    expect((await state()).purchase?.status).toBe("pending");
    await t.run((ctx) => ctx.db.patch("experiencePurchases", ids.purchaseId, { whopCheckoutId: "ch_fixture" }));
    expect((await t.fetch("/whop/webhook", { method: "POST", body, headers: await signed(body) })).status).toBe(200);
    expect((await state()).business?.earned).toBe(32.5);
    expect(console.error).toHaveBeenCalledWith("whop.handleEvent failed");
  });

  it("never fulfills from metadata when both provider binding fields are missing", async () => {
    const { t, event, state } = await fixture();
    const body = JSON.stringify({ ...event, data: { ...event.data, variant_id: null, checkout_configuration_id: null } });
    expect((await t.fetch("/whop/webhook", { method: "POST", body, headers: await signed(body) })).status).toBe(500);
    expect((await state()).purchase?.status).toBe("pending");
    expect((await state()).business?.earned).toBe(7);
  });

  it("retries rather than acknowledging experience payments when the account is not configured", async () => {
    vi.stubEnv("WHOP_COMPANY_ID", undefined);
    const { t, event, state } = await fixture();
    const body = JSON.stringify(event);
    expect((await t.fetch("/whop/webhook", { method: "POST", body, headers: await signed(body) })).status).toBe(500);
    expect((await state()).purchase?.status).toBe("pending");
  });

  it.each([
    { metadata: { kind: "experience", experienceId: "legacy", userId: "legacy" } },
    { status: "pending" }, { substatus: "refunded" }, { currency: "eur" }, { account_id: "biz_other" },
    { id: null }, { id: {} }, { subtotal: 25.5 }, { subtotal: money("2550") },
    { subtotal: money("2.55e1") }, { subtotal: money("25.5001") }, { subtotal: money("-25.50") },
    { subtotal: money("9007199254740993") }, { subtotal: { amount: "25.50", currency: "eur" } },
    { total: money("24.00") }, { total: null }, { tax_amount: money("2.55"), tax_behavior: null },
    { line_items: [] }, { line_items: [{ variant_id: "plan_fixture", quantity: 2, subtotal: money("25.50") }] },
    { variant_id: "plan_other" }, { checkout_configuration_id: "ch_other" },
    { checkout_configuration_id: {} }, { metadata: [] },
  ])("does not fulfill malformed or mismatched data: %j", async (override) => {
    const { t, event, state } = await fixture();
    await t.action(internal.whop.handleEvent, { event: { ...event, data: { ...event.data, ...override } } });
    const result = await state();
    expect(result.purchase?.status).not.toBe("completed");
    expect(result.business?.earned).toBe(7);
    expect(result.pot?.balance).toBe(40);
    expect(result.transactions).toEqual([]);
  });

  it.each([null, [], {}, { type: "payment.failed" }, { type: "payment.succeeded", data: [] }])(
    "ignores unrelated or malformed envelopes: %j", async (event) => {
      const { t, state } = await fixture();
      const before = await state();
      await t.action(internal.whop.handleEvent, { event });
      expect(await state()).toEqual(before);
    },
  );

  it("preserves contribution fulfillment and payment deduplication", async () => {
    const { t, ids, state } = await fixture();
    const event = { type: "payment.succeeded", data: { id: "pay_contribution", metadata: {
      kind: "contribution", potId: ids.potId, userId: ids.userId, amount: "10",
    } } };
    await t.action(internal.whop.handleEvent, { event });
    await t.action(internal.whop.handleEvent, { event });
    const result = await state();
    expect(result.pot?.balance).toBe(50);
    expect(result.transactions).toHaveLength(1);
    expect(result.business?.earned).toBe(7);
    expect(result.purchase?.status).toBe("pending");
  });
});

describe("purchase money invariants", () => {
  it.each([25.504, 1e-10, 0, -1, NaN, Infinity, Number.MAX_VALUE, 1e14])(
    "rejects invalid or unsafe unit price %s before checkout", async (pricePerPerson) => {
      const { t, ids } = await fixture();
      await t.run((ctx) => ctx.db.patch("experiences", ids.experienceId, { pricePerPerson }));
      await expect(t.mutation(internal.purchases.createPending, {
        userId: ids.userId, experienceId: ids.experienceId, quantity: 1,
      })).rejects.toThrow();
      expect(await t.run((ctx) => ctx.db.query("experiencePurchases").collect())).toHaveLength(1);
    },
  );

  it.each([0, 1.5, Number.MAX_SAFE_INTEGER + 1, 1e308, Math.floor(Number.MAX_SAFE_INTEGER / 2550) + 1])(
    "rejects invalid quantity or overflowing total %s before checkout", async (quantity) => {
      const { t, ids } = await fixture();
      await t.run((ctx) => ctx.db.patch("experiences", ids.experienceId, { maxGroup: Number.MAX_SAFE_INTEGER }));
      await expect(t.mutation(internal.purchases.createPending, {
        userId: ids.userId, experienceId: ids.experienceId, quantity,
      })).rejects.toThrow();
      expect(await t.run((ctx) => ctx.db.query("experiencePurchases").collect())).toHaveLength(1);
    },
  );

  it("allows the maximum group quantity and rejects a larger purchase", async () => {
    const { t, ids } = await fixture();
    const purchaseId = await t.mutation(internal.purchases.createPending, {
      userId: ids.userId, experienceId: ids.experienceId, quantity: 4,
    });
    expect((await t.query(internal.purchases.getPurchase, { purchaseId }))?.amount).toBe(102);
    await expect(t.mutation(internal.purchases.createPending, {
      userId: ids.userId, experienceId: ids.experienceId, quantity: 5,
    })).rejects.toThrow();
  });

  it("completes $25.50 times three once, after rejecting a one-cent underpayment", async () => {
    const { t, ids, event, state } = await fixture();
    const purchaseId = await t.mutation(internal.purchases.createPending, {
      userId: ids.userId, experienceId: ids.experienceId, quantity: 3,
    });
    await t.mutation(internal.purchases.attachCheckout, {
      purchaseId, whopCheckoutId: "ch_three", checkoutUrl: "https://example.test/synthetic",
    });
    const payment = (amount: string) => ({ ...event, data: { ...event.data,
      metadata: { kind: "experience", purchaseId }, checkout_configuration_id: "ch_three",
      subtotal: money(amount), total: money(amount),
      line_items: [{ variant_id: "plan_fixture", quantity: 3, subtotal: money(amount) }],
    } });
    await t.action(internal.whop.handleEvent, { event: payment("76.49") });
    expect((await t.query(internal.purchases.getPurchase, { purchaseId }))?.status).toBe("failed");
    expect((await state()).business?.earned).toBe(7);
    await t.action(internal.whop.handleEvent, { event: payment("76.50") });
    const completed = await t.query(internal.purchases.getPurchase, { purchaseId });
    expect(completed).toMatchObject({ amount: 76.5, quantity: 3, status: "completed" });
    await t.action(internal.whop.handleEvent, { event: payment("76.50") });
    expect(await t.query(internal.purchases.getPurchase, { purchaseId })).toEqual(completed);
    expect((await state()).business?.earned).toBe(83.5);
    expect((await state()).transactions).toEqual([]);
  });

  it.each([25.504, 1e-10, 1e14, Infinity])("refuses invalid legacy snapshot amount %s without reserving payment", async (amount) => {
    const { t, ids, state } = await fixture();
    await t.run((ctx) => ctx.db.patch("experiencePurchases", ids.purchaseId, { amount }));
    const result = await t.mutation(internal.purchases.markPaid, {
      purchaseId: ids.purchaseId, whopPaymentId: "pay_fixture", amount,
      currency: "usd", whopCheckoutId: "ch_fixture", whopPlanId: "plan_fixture",
    });
    expect(result.result).toBe("failed");
    const after = await state();
    expect(after.purchase?.whopPaymentId).toBeUndefined();
    expect(after.purchase?.completedAt).toBeUndefined();
    expect(after.business?.earned).toBe(7);
  });

  it("does not accept a $25.50 native webhook for a legacy $25.504 purchase", async () => {
    const { t, ids, event, state } = await fixture();
    await t.run((ctx) => ctx.db.patch("experiencePurchases", ids.purchaseId, { amount: 25.504 }));
    await t.action(internal.whop.handleEvent, { event });
    expect((await state()).purchase?.status).toBe("failed");
    expect((await state()).purchase?.whopPaymentId).toBeUndefined();
    expect((await state()).business?.earned).toBe(7);
  });

  it("refuses earnings addition that exceeds the safe-integer cents bound", async () => {
    const { t, ids, event, state } = await fixture();
    const earned = 90_071_992_547_400;
    await t.run((ctx) => ctx.db.patch("businesses", ids.businessId, { earned }));
    await t.action(internal.whop.handleEvent, { event });
    const after = await state();
    expect(after.purchase?.status).toBe("failed");
    expect(after.purchase?.whopPaymentId).toBeUndefined();
    expect(after.purchase?.completedAt).toBeUndefined();
    expect(after.business?.earned).toBe(earned);
    expect(after.transactions).toEqual([]);
  });

  it("accepts zero existing earnings", async () => {
    const { t, ids, event, state } = await fixture();
    await t.run((ctx) => ctx.db.patch("businesses", ids.businessId, { earned: 0 }));
    await t.action(internal.whop.handleEvent, { event });
    expect((await state()).purchase?.status).toBe("completed");
    expect((await state()).business?.earned).toBe(25.5);
  });

  it.each([-1, 25.504, NaN, Infinity])("rejects invalid existing earnings %s without reserving payment", async (earned) => {
    const { t, ids, event, state } = await fixture();
    await t.run((ctx) => ctx.db.patch("businesses", ids.businessId, { earned }));
    await t.action(internal.whop.handleEvent, { event });
    const after = await state();
    expect(after.purchase?.status).toBe("failed");
    expect(after.purchase?.whopPaymentId).toBeUndefined();
    expect(after.business?.earned).toBe(earned);
  });

  it("adds valid earnings in cents without accumulating fractional-cent artifacts", async () => {
    const { t, ids, event, state } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch("experiencePurchases", ids.purchaseId, { amount: 0.2 });
      await ctx.db.patch("businesses", ids.businessId, { earned: 0.1 });
    });
    await t.action(internal.whop.handleEvent, { event: { ...event, data: { ...event.data,
      subtotal: money("0.20"), total: money("0.20"),
      line_items: [{ variant_id: "plan_fixture", quantity: 1, subtotal: money("0.20") }],
    } } });
    expect((await state()).purchase?.status).toBe("completed");
    expect((await state()).business?.earned).toBe(0.3);
  });
});

describe("raw-body signature guard", () => {
  it.each(["not-a-timestamp", "NaN", "Infinity", "1800000000.1", "1e9", "", "1799999399", "1800000601"])(
    "rejects signed invalid/expired timestamp %s before fulfillment", async (timestamp) => {
      const { t, event, state } = await fixture();
      const body = JSON.stringify(event);
      const res = await t.fetch("/whop/webhook", { method: "POST", body, headers: await signed(body, timestamp) });
      expect(res.status).toBe(401);
      expect((await state()).purchase?.status).toBe("pending");
    },
  );

  it.each(["v2", "v0", ""])("rejects unsupported signature version %s", async (version) => {
    const { t, event, state } = await fixture();
    const body = JSON.stringify(event);
    const res = await t.fetch("/whop/webhook", { method: "POST", body, headers: await signed(body, undefined, version) });
    expect(res.status).toBe(401);
    expect((await state()).purchase?.status).toBe("pending");
  });

  it("rejects tampered bodies, missing headers, and malformed signatures", async () => {
    const { t, event, state } = await fixture();
    const body = JSON.stringify(event);
    const headers = await signed(body);
    expect((await t.fetch("/whop/webhook", { method: "POST", body: body + " ", headers })).status).toBe(401);
    expect((await t.fetch("/whop/webhook", { method: "POST", body })).status).toBe(401);
    headers["webhook-signature"] = "v1,%%%";
    expect((await t.fetch("/whop/webhook", { method: "POST", body, headers })).status).toBe(401);
    expect((await state()).purchase?.status).toBe("pending");
  });

  it("supports rotated v1 signatures and existing whsec keys", async () => {
    const keySecret = "whsec_" + btoa("synthetic legacy key");
    vi.stubEnv("WHOP_WEBHOOK_SECRET", keySecret);
    const { t, event, state } = await fixture();
    const body = JSON.stringify(event);
    const headers = await signed(body, undefined, "v1", keySecret);
    headers["webhook-signature"] = "v1,invalid v2,ignored " + headers["webhook-signature"];
    expect((await t.fetch("/whop/webhook", { method: "POST", body, headers })).status).toBe(200);
    expect((await state()).purchase?.status).toBe("completed");
  });

  it("returns 400 for signed invalid JSON without dispatching", async () => {
    const { t, state } = await fixture();
    const body = "{";
    expect((await t.fetch("/whop/webhook", { method: "POST", body, headers: await signed(body) })).status).toBe(400);
    expect((await state()).purchase?.status).toBe("pending");
  });
});

describe("mock group card", () => {
  it("issues one demo card per existing group from the public mutation", async () => {
    const { t, ids } = await fixture();
    const first = await t.mutation(api.cards.issueCard, { groupId: ids.groupId });
    expect(await t.mutation(api.cards.issueCard, { groupId: ids.groupId })).toBe(first);
    const view = await t.query(api.cards.getCard, { groupId: ids.groupId });
    expect(view).toMatchObject({ card: { status: "mock-active" }, limit: 40 });
    expect(view!.card.last4).toMatch(/^\d{4}$/);
    const orphan = await t.run(async (ctx) => {
      const id = await ctx.db.insert("groups", { name: "Gone", inviteCode: "GONE00", ownerId: ids.userId, memberIds: [] });
      await ctx.db.delete("groups", id);
      return id;
    });
    await expect(t.mutation(api.cards.issueCard, { groupId: orphan })).rejects.toThrow("Group not found");
  });
});

describe("explicit Whop demo mode", () => {
  const pay = (t: Awaited<ReturnType<typeof fixture>>["t"], token: string, extra = "") => t.fetch("/whop/mock-pay", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `token=${token}${extra}`,
  });
  const tokenFrom = (url: string) => {
    expect(new URL(url).origin).toBe("https://fixture.convex.site");
    expect(new URL(url).pathname).toBe("/whop/mock-checkout");
    const token = new URL(url).searchParams.get("token")!;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    return token;
  };

  it.each([undefined, "false", "TRUE", "1"])("returns 404 on both routes unless the flag is exactly true (%s)", async (flag) => {
    vi.stubEnv("WHOP_MOCK", flag);
    const { t } = await fixture();
    expect((await t.fetch(`/whop/mock-checkout?token=${"a".repeat(64)}`)).status).toBe(404);
    expect((await pay(t, "a".repeat(64))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps real checkout behavior when mock mode is unset", async () => {
    const { t, ids } = await fixture();
    const outgoing = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ id: "ch_real", purchase_url: "https://sandbox.whop.com/checkout/real" }), { status: 200 })));
    vi.stubGlobal("fetch", outgoing);
    expect(await t.action(api.whop.createContributionCheckout, { userId: ids.userId, groupId: ids.groupId, amount: 10 })).toBe("https://sandbox.whop.com/checkout/real");
    expect(await t.action(api.experienceCheckout.createExperienceCheckout, { userId: ids.userId, experienceId: ids.experienceId })).toBe("https://sandbox.whop.com/checkout/real");
    expect(outgoing).toHaveBeenCalledTimes(2);
    expect(await t.run((ctx) => ctx.db.query("whopMockCheckouts").collect())).toEqual([]);
  });

  it("does not auto-fallback to a mock payment on a provider 401", async () => {
    const { t, ids } = await fixture();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("Authentication failed", { status: 401 }))));
    await expect(t.action(api.experienceCheckout.createExperienceCheckout, { userId: ids.userId, experienceId: ids.experienceId })).rejects.toThrow("401");
    expect(await t.run((ctx) => ctx.db.query("whopMockCheckouts").collect())).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get("businesses", ids.businessId)))?.earned).toBe(7);
  });

  it("creates a token-backed contribution and credits it exactly once", async () => {
    vi.stubEnv("WHOP_MOCK", "true");
    vi.stubEnv("WHOP_API_KEY", undefined);
    vi.stubEnv("WHOP_COMPANY_ID", undefined);
    const { t, ids, state } = await fixture();
    const token = tokenFrom(await t.action(api.whop.createContributionCheckout, { userId: ids.userId, groupId: ids.groupId, amount: 10 }));
    const page = await t.fetch(`/whop/mock-checkout?token=${token}&amount=999`);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("referrer-policy")).toBe("same-origin");
    expect(html).toContain("Demo payment: Whop is simulated");
    expect(html).toContain("Synthetic crew fun fund");
    expect(html).toContain("$10.00");
    expect((await state()).pot?.balance).toBe(40);
    const responses = await Promise.all([pay(t, token, "&amount=999&potId=forged"), pay(t, token)]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Return to the app");
    }
    const after = await state();
    expect(after.pot?.balance).toBe(50);
    expect(after.transactions).toHaveLength(1);
    expect(after.transactions[0].whopPaymentId).toBe(`mock_pay_${token}`);
    expect(after.business?.earned).toBe(7);
    expect(after.purchase?.status).toBe("pending");
    expect(await (await t.fetch(`/whop/mock-checkout?token=${token}`)).text()).not.toContain('<button type="submit">');
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates deterministic mock product IDs and completes an experience without touching the pot", async () => {
    vi.stubEnv("WHOP_MOCK", "true");
    const { t, ids, state } = await fixture();
    await t.run((ctx) => ctx.db.patch("experiences", ids.experienceId, { whopPlanId: undefined }));
    const token = tokenFrom(await t.action(api.experienceCheckout.createExperienceCheckout, { userId: ids.userId, experienceId: ids.experienceId }));
    const experience = await t.run((ctx) => ctx.db.get("experiences", ids.experienceId));
    expect(experience).toMatchObject({ whopProductId: `prod_mock_${ids.experienceId}`, whopPlanId: `plan_mock_${ids.experienceId}` });
    const checkout = await t.query(internal.whopMock.getCheckout, { token });
    expect(checkout).toMatchObject({ status: "pending", amount: 25.5, currency: "usd", title: "Synthetic business" });
    const purchaseId = checkout!.purchaseId!;
    expect(await t.query(internal.purchases.getPurchase, { purchaseId })).toMatchObject({ status: "pending", whopCheckoutId: `ch_mock_${token}` });
    expect((await state()).business?.earned).toBe(7);
    const responses = await Promise.all([pay(t, token), pay(t, token)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await t.query(internal.purchases.getPurchase, { purchaseId })).toMatchObject({ status: "completed", whopPaymentId: `mock_pay_${token}` });
    expect((await state()).business?.earned).toBe(32.5);
    expect((await state()).pot?.balance).toBe(40);
    expect((await state()).transactions).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts any positive cent-exact top-up and rejects zero or fractional cents", async () => {
    vi.stubEnv("WHOP_MOCK", "true");
    const { t, ids, state } = await fixture();
    for (const amount of [0, 0.004, 1.005, -1]) {
      await expect(t.action(api.whop.createContributionCheckout, { userId: ids.userId, groupId: ids.groupId, amount })).rejects.toThrow("dollars and cents");
    }
    for (const amount of [0.01, 0.07, 12.34]) {
      const token = tokenFrom(await t.action(api.whop.createContributionCheckout, { userId: ids.userId, groupId: ids.groupId, amount }));
      expect((await pay(t, token)).status).toBe(200);
    }
    const after = await state();
    expect(after.transactions.map((tx) => tx.amount)).toEqual([0.01, 0.07, 12.34]);
    expect(Math.round(after.pot!.balance * 100)).toBe(5242);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("expires unpaid tokens and rejects unknown tokens without any credit", async () => {
    vi.stubEnv("WHOP_MOCK", "true");
    const { t, ids, state } = await fixture();
    const token = tokenFrom(await t.action(api.whop.createContributionCheckout, { userId: ids.userId, groupId: ids.groupId, amount: 10 }));
    vi.spyOn(Date, "now").mockReturnValue(now + 31 * 60 * 1000);
    expect((await t.fetch(`/whop/mock-checkout?token=${token}`)).status).toBe(410);
    expect((await pay(t, token)).status).toBe(409);
    expect((await pay(t, "b".repeat(64))).status).toBe(404);
    expect((await pay(t, "invalid")).status).toBe(404);
    expect((await state()).pot?.balance).toBe(40);
  });

  it("disables already-issued tokens and internal mock fulfillment when the flag turns off", async () => {
    vi.stubEnv("WHOP_MOCK", "true");
    const { t, ids, state } = await fixture();
    const token = tokenFrom(await t.action(api.whop.createContributionCheckout, { userId: ids.userId, groupId: ids.groupId, amount: 10 }));
    vi.stubEnv("WHOP_MOCK", undefined);
    expect((await t.fetch(`/whop/mock-checkout?token=${token}`)).status).toBe(404);
    expect((await pay(t, token)).status).toBe(404);
    expect(await t.mutation(internal.whopMock.pay, { token })).toBeNull();
    expect((await state()).pot?.balance).toBe(40);
  });

  it("escapes display names and rejects cross-origin payment forms", async () => {
    vi.stubEnv("WHOP_MOCK", "true");
    const { t, ids, state } = await fixture();
    await t.run((ctx) => ctx.db.patch("groups", ids.groupId, { name: '<script>alert("fixture")</script>' }));
    const token = tokenFrom(await t.action(api.whop.createContributionCheckout, { userId: ids.userId, groupId: ids.groupId, amount: 10 }));
    const html = await (await t.fetch(`/whop/mock-checkout?token=${token}`)).text();
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect((await t.fetch("/whop/mock-pay", { method: "POST", headers: {
      "Content-Type": "application/x-www-form-urlencoded", origin: "https://untrusted.example",
    }, body: `token=${token}` })).status).toBe(403);
    expect((await state()).pot?.balance).toBe(40);
  });

  it("rolls back consumption when the purchase cannot be fulfilled", async () => {
    vi.stubEnv("WHOP_MOCK", "true");
    const { t, ids, state } = await fixture();
    const token = tokenFrom(await t.action(api.experienceCheckout.createExperienceCheckout, { userId: ids.userId, experienceId: ids.experienceId }));
    await t.run((ctx) => ctx.db.delete("businesses", ids.businessId));
    expect((await pay(t, token)).status).toBe(409);
    expect((await t.query(internal.whopMock.getCheckout, { token }))?.status).toBe("pending");
    expect((await state()).transactions).toEqual([]);
  });

  it("never calls Whop for demo transfers or unsupported sponsor checkout", async () => {
    vi.stubEnv("WHOP_MOCK", "true");
    const { t, ids } = await fixture();
    const transactionId = await t.run((ctx) => ctx.db.insert("transactions", {
      potId: ids.potId, type: "spend", amount: 10, experienceId: ids.experienceId, status: "completed",
    }));
    await t.action(internal.whop.transferToBusiness, { transactionId });
    expect((await t.run((ctx) => ctx.db.get("transactions", transactionId)))?.note).toBe("Demo transfer: Whop is simulated");
    const sponsorId = await t.run(async (ctx) => {
      const placeId = await ctx.db.insert("places", { name: "Fixture", area: "Fixture", category: "activity",
        priceLevel: 1, tags: [], lat: 0, lng: 0, durationMins: 30 });
      return await ctx.db.insert("sponsors", { business: "Fixture", offer: "Fixture", placeId, priceLevel: 1,
        tags: [], rewardCost: 0, payPerVisit: 1, active: true });
    });
    await expect(t.action(api.whop.createSponsorCheckout, { sponsorId })).rejects.toThrow("unavailable in demo mode");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reprovisions mock-only product IDs when real mode is restored", async () => {
    const { t, ids } = await fixture();
    await t.run((ctx) => ctx.db.patch("experiences", ids.experienceId, { whopPlanId: `plan_mock_${ids.experienceId}` }));
    const outgoing = vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(
      url.endsWith("/products") ? { id: "prod_restored" } : url.endsWith("/variants") ? { id: "plan_restored" }
        : { id: "ch_restored", purchase_url: "https://sandbox.whop.com/checkout/restored" },
    ), { status: 200 })));
    vi.stubGlobal("fetch", outgoing);
    expect(await t.action(api.experienceCheckout.createExperienceCheckout, { userId: ids.userId, experienceId: ids.experienceId }))
      .toBe("https://sandbox.whop.com/checkout/restored");
    expect(outgoing).toHaveBeenCalledTimes(3);
    expect(await t.run((ctx) => ctx.db.query("whopMockCheckouts").collect())).toEqual([]);
  });

  it("does not send a stale mock variant to real checkout after failed reprovisioning", async () => {
    const { t, ids } = await fixture();
    await t.run((ctx) => ctx.db.patch("experiences", ids.experienceId, { whopPlanId: `plan_mock_${ids.experienceId}` }));
    const outgoing = vi.fn(() => Promise.resolve(new Response("Authentication failed", { status: 401 })));
    vi.stubGlobal("fetch", outgoing);
    await expect(t.action(api.experienceCheckout.createExperienceCheckout, { userId: ids.userId, experienceId: ids.experienceId }))
      .rejects.toThrow("isn't on Whop yet");
    expect(outgoing).toHaveBeenCalledTimes(1);
    expect(await t.run((ctx) => ctx.db.query("whopMockCheckouts").collect())).toEqual([]);
  });

  it("keeps the real webhook signature requirement even in demo mode", async () => {
    vi.stubEnv("WHOP_MOCK", "true");
    const { t, event, state } = await fixture();
    expect((await t.fetch("/whop/webhook", { method: "POST", body: JSON.stringify(event) })).status).toBe(401);
    expect((await state()).purchase?.status).toBe("pending");
  });
});
