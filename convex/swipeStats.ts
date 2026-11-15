import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MIN_RESPONSES = 5;
const MAX_SWIPES = 5000;

// Anonymized this-or-that split for one school: counts only, never who picked what.
export const getSchoolSplits = query({
  args: { school: v.string(), pairs: v.array(v.object({ a: v.string(), b: v.string() })) },
  handler: async (ctx, { school, pairs }) => {
    const wanted = new Map(pairs.map((p, i) => [`${p.a}\u0000${p.b}`, i]));
    const counts = pairs.map(() => ({ a: 0, b: 0 }));
    const schoolOf = new Map<Id<"users">, string | null>();

    const swipes = await ctx.db.query("swipes").order("desc").take(MAX_SWIPES);
    for (const s of swipes) {
      const forward = wanted.get(`${s.chosen}\u0000${s.rejected}`);
      const backward = wanted.get(`${s.rejected}\u0000${s.chosen}`);
      if (forward === undefined && backward === undefined) continue;
      if (!schoolOf.has(s.userId)) schoolOf.set(s.userId, (await ctx.db.get("users", s.userId))?.homeArea ?? null);
      if (schoolOf.get(s.userId) !== school) continue;
      if (forward !== undefined) counts[forward].a++;
      else counts[backward!].b++;
    }

    return counts.map(({ a, b }) => {
      const total = a + b;
      if (total < MIN_RESPONSES) return { aPercent: 50, bPercent: 50, total, fallback: true };
      const aPercent = Math.round((a / total) * 100);
      return { aPercent, bPercent: 100 - aPercent, total, fallback: false };
    });
  },
});
