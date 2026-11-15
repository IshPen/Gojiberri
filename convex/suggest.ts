"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { chatJSON } from "./llm";
import { priceRange } from "./pricing";
import { travelEstimate } from "./places";

const SYSTEM_PROMPT = `You plan outings for a friend group. Pick exactly 3 places from CANDIDATES that this
group will love, that fit EVERY member's budget and diet, and that suit the time WINDOW.
Use MEMORIES to personalize. Each "why" is one sentence (max 18 words) that cites a
specific memory, e.g. "You rated the escape room 5 stars, so here's a puzzle bar."
If SPONSOR is provided and fits, you may use it as one of the 3.
Return ONLY JSON: {"options":[{"placeId":"...","title":"...","why":"..."}]}`;

const FALLBACK_WHY = "Matches your crew's vibe.";
const MAX_CANDIDATES = 25;

type Pick = { placeId: Id<"places">; title: string; why: string };

function tagOverlap(place: Doc<"places">, vibes: Set<string>) {
  return place.tags.filter((t) => vibes.has(t.toLowerCase())).length;
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function validPicks(raw: unknown, allowed: Map<string, Doc<"places">>): Pick[] | null {
  const options = (raw as { options?: unknown })?.options;
  if (!Array.isArray(options)) return null;
  const seen = new Set<string>();
  const picks: Pick[] = [];
  for (const option of options) {
    const { placeId, title, why } = (option ?? {}) as Record<string, unknown>;
    if (typeof placeId !== "string" || !allowed.has(placeId) || seen.has(placeId)) continue;
    seen.add(placeId);
    picks.push({
      placeId: placeId as Id<"places">,
      title: typeof title === "string" && title.trim() ? title.trim() : allowed.get(placeId)!.name,
      why: typeof why === "string" && why.trim() ? why.trim() : FALLBACK_WHY,
    });
  }
  return picks.length === 3 ? picks : null;
}

export const generateSuggestions = internalAction({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }): Promise<null> => {
    const { plan, group, members, lowRatedPlaceIds } = await ctx.runQuery(internal.context.planContext, { planId });

    const budgetCap = Math.min(...members.map((m) => m.budgetMax));
    const diets = [...new Set(members.flatMap((m) => m.diet))];
    const vibes = new Set(members.flatMap((m) => m.vibes.map((t) => t.toLowerCase())));
    const homeArea = mostCommon(members.map((m) => m.homeArea));

    const excluded = new Set<string>(lowRatedPlaceIds);
    const candidates = (
      await ctx.runQuery(internal.places.listCandidates, {
        budgetMax: budgetCap,
        areas: members.map((m) => m.homeArea),
      })
    )
      .filter((p) => !excluded.has(p._id))
      .sort((a, b) => tagOverlap(b, vibes) - tagOverlap(a, vibes));

    const [memories, sponsor] = await Promise.all([
      ctx.runAction(internal.memory.getGroupContext, { groupId: group._id }),
      ctx.runQuery(internal.sponsors.pickSponsored, { budgetMax: budgetCap, tags: [...vibes] }),
    ]);

    const shortlist = candidates.slice(0, MAX_CANDIDATES);
    const sponsorPlace = sponsor ? candidates.find((p) => p._id === sponsor.placeId) : undefined;
    if (sponsorPlace && !shortlist.includes(sponsorPlace)) shortlist.push(sponsorPlace);
    const allowed = new Map(shortlist.map((p) => [p._id as string, p]));

    let picks: Pick[] | null = null;
    try {
      const raw = await chatJSON(SYSTEM_PROMPT, {
        WINDOW: {
          start: new Date(plan.window.start).toISOString(),
          end: new Date(plan.window.end).toISOString(),
          timezone: "America/Los_Angeles",
        },
        BUDGET_CAP: budgetCap,
        DIETS: diets,
        CANDIDATES: shortlist.map((p) => ({
          id: p._id,
          name: p.name,
          area: p.area,
          category: p.category,
          priceLevel: p.priceLevel,
          tags: p.tags,
        })),
        MEMORIES: memories,
        SPONSOR:
          sponsor && sponsorPlace
            ? { placeId: sponsor.placeId, business: sponsor.business, offer: sponsor.offer }
            : null,
      });
      picks = validPicks(raw, allowed);
      if (!picks) console.warn("LLM returned unusable options, using fallback", raw);
    } catch (err) {
      console.warn("LLM call failed, using fallback", err);
    }

    picks ??= shortlist.slice(0, 3).map((p) => ({ placeId: p._id, title: p.name, why: FALLBACK_WHY }));

    let sponsorUsed = false;
    const options = picks.map((pick) => {
      const place = allowed.get(pick.placeId)!;
      const { min, max } = priceRange(place.priceLevel);
      const isSponsored = !sponsorUsed && sponsor !== null && sponsor.placeId === pick.placeId;
      if (isSponsored) sponsorUsed = true;
      return {
        placeId: pick.placeId,
        title: pick.title,
        costMin: min,
        costMax: max,
        why: pick.why,
        travel: travelEstimate(homeArea, place),
        ...(isSponsored ? { sponsorId: sponsor!._id } : {}),
      };
    });

    await ctx.runMutation(internal.plans.saveOptions, { planId, options });
    return null;
  },
});
