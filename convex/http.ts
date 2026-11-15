import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { external } from "./refs";

const http = httpRouter();

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
