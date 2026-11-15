import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { external } from "./refs";

const http = httpRouter();

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function mockCheckoutPage(checkout: Doc<"whopMockCheckouts">) {
  const paid = checkout.status === "paid";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(checkout.amount);
  const contribution = checkout.kind === "contribution";
  const sponsor = checkout.kind === "sponsor";
  const title = paid ? "You're all set" : contribution ? "Chip in to your crew" : sponsor ? "Fund more quests" : "Complete your booking";
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Goji</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8f5ed;color:#203b2d;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;min-height:100vh;padding:32px 20px}
main{max-width:440px;margin:0 auto}.brand{font-size:28px;font-weight:850;letter-spacing:-1px;margin-bottom:36px}.dot{color:#e77850}
h1{font-size:32px;line-height:1.15;letter-spacing:-1px;margin:0 0 10px}p{color:#657065;font-size:15px;line-height:1.6;margin:0}
.card{background:#fff;border:1px solid #e3e5da;border-radius:20px;padding:22px 24px;margin:26px 0 20px}.label{font-size:11px;font-weight:750;letter-spacing:1.5px;text-transform:uppercase;color:#798174}
h2{font-size:18px;line-height:1.4;margin:6px 0 18px;overflow-wrap:anywhere}.row{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #eceee5;padding-top:16px}
.row span{color:#657065;font-size:14px}.amount{font-size:34px;line-height:1;font-weight:750;letter-spacing:-1px}
button{font:inherit;font-size:17px;font-weight:750;width:100%;border:0;border-radius:14px;padding:18px 12px;background:#285c3e;color:#fff;cursor:pointer;min-height:56px}button:focus-visible{outline:3px solid #e77850;outline-offset:3px}
.success{padding:16px;background:#e7efdf;border-radius:14px;font-weight:650;line-height:1.5}.foot{margin-top:28px;font-size:12px;color:#798174;text-align:center}
</style></head><body><main><div class="brand">goji<span class="dot">.</span></div><h1>${title}</h1>
<p>${paid ? "Your payment is recorded." : contribution ? "Review your contribution, then confirm." : sponsor ? "Review your quest pack, then confirm." : "Review your order, then confirm."}</p>
<section class="card"><div class="label">${contribution ? "Chip in to" : sponsor ? "Sponsored quest pack for" : "Experience from"}</div>
<h2>${escapeHtml(checkout.title)}</h2><div class="row"><span>${paid ? "Paid" : "Total"} (USD)</span><div class="amount">${amount}</div></div></section>
${paid ? '<div class="success">Return to the app to see your updated ' + (contribution ? "fund balance." : sponsor ? "sponsorship." : "purchase status.") + '</div>' : `<form action="/whop/mock-pay" method="post"><input type="hidden" name="token" value="${escapeHtml(checkout.token)}"><button type="submit">Pay ${amount}</button></form>`}
<div class="foot">Simulated checkout · no real payment is made</div></main></body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

http.route({
  path: "/whop/mock-checkout", method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (env.WHOP_MOCK !== "true") return new Response("Not found", { status: 404 });
    const token = new URL(req.url).searchParams.get("token");
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return new Response("Not found", { status: 404 });
    const checkout = await ctx.runQuery(internal.whopMock.getCheckout, { token });
    if (!checkout) return new Response("Not found", { status: 404 });
    if (checkout.status !== "paid" && checkout.expiresAt <= Date.now()) return new Response("Demo checkout expired", { status: 410 });
    return mockCheckoutPage(checkout);
  }),
});

http.route({
  path: "/whop/mock-pay", method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (env.WHOP_MOCK !== "true") return new Response("Not found", { status: 404 });
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) return new Response("Forbidden", { status: 403 });
    if (req.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") {
      return new Response("Expected checkout form", { status: 415 });
    }
    const body = await req.text();
    if (body.length > 1024) return new Response("Form is too large", { status: 413 });
    const token = new URLSearchParams(body).get("token");
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return new Response("Not found", { status: 404 });
    try {
      const checkout = await ctx.runMutation(internal.whopMock.pay, { token });
      if (!checkout) return new Response("Not found", { status: 404 });
      return mockCheckoutPage(checkout);
    } catch {
      return new Response("Demo payment could not complete. Return to the app and start a new checkout.", { status: 409 });
    }
  }),
});

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Whop delivers webhooks per the Standard Webhooks spec:
// HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{body}", base64, in "v1,<sig>" entries.
async function verifyWhop(req: Request, body: string) {
  const secret = env.WHOP_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signatures = req.headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) return false;
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(Number(timestamp))) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) return false;
  const keyBytes = secret.startsWith("whsec_")
    ? base64ToBytes(secret.slice("whsec_".length))
    : new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedBody = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  for (const entry of signatures.split(" ")) {
    const [version, signature, extra] = entry.split(",");
    if (version !== "v1" || !signature || extra !== undefined) continue;
    try {
      if (await crypto.subtle.verify("HMAC", key, base64ToBytes(signature), signedBody)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

http.route({
  path: "/whop/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    if (!(await verifyWhop(req, body))) return new Response("Invalid signature", { status: 401 });
    let event: unknown;
    try {
      event = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    try {
      await ctx.runAction(external.handleWhopEvent, { event });
    } catch {
      console.error("whop.handleEvent failed");
      return new Response("Handler unavailable", { status: 500 });
    }
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/keiki/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env.KEIKI_WEBHOOK_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    const { chatId, sender, text } = (body ?? {}) as Record<string, unknown>;
    if (typeof chatId !== "string" || typeof sender !== "string" || typeof text !== "string") {
      return new Response("Expected { chatId, sender, text }", { status: 400 });
    }
    try {
      await ctx.runAction(external.handleKeikiMessage, { chatId, sender, text });
    } catch (e) {
      console.error("keiki.handleMessage failed", e);
      return new Response("Handler unavailable", { status: 500 });
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
