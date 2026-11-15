import { ConvexError } from "convex/values";

type Short = { name: string; shortBy: number };

const dollars = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

export function friendlyError(e: unknown, fallback = "Something went wrong."): string {
  if (e instanceof ConvexError) {
    const data: unknown = e.data;
    if (typeof data === "string") return data;
    const obj = data as { code?: string; attendees?: Short[]; message?: string } | null;
    if (obj?.code === "ATTENDEES_SHORT") {
      const short = obj.attendees ?? [];
      return short.length > 0 ? `Still short: ${short.map((s) => `${s.name} needs ${dollars(s.shortBy)}`).join(", ")}.` : "Someone's share is still short.";
    }
    return typeof obj?.message === "string" ? obj.message : fallback;
  }
  if (!(e instanceof Error)) return fallback;
  return e.message.replace(/^.*Uncaught (?:Convex)?Error: /s, "").split("\n")[0] || fallback;
}
