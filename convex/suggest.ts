"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { optionValidator } from "./plans";
import { chatJSON } from "./llm";
import { priceRange } from "./pricing";
import { travelEstimate } from "./places";

const SYSTEM_PROMPT = `You plan outings for a friend group that shares a fun fund (POT).
Pick exactly 3 picks from CANDIDATES that this group will love and that suit the time WINDOW.
Experiences are paid from the POT and already fit it; prefer them. Places are free or cheap backups.
If SEED is set, the group already chose that candidate: it must be one of the 3 picks.
Use MEMORIES to personalize. Each "why" is one sentence (max 18 words) that cites a
specific memory or the pot, e.g. "You rated the escape room 5 stars, and it fits your $60 pot with $12 to spare."
Return ONLY JSON: {"options":[{"id":"...","title":"...","why":"..."}]}`;

const FALLBACK_WHY = "Matches your crew's vibe.";
const MAX_PLACES = 1;

type Candidate =
  | { kind: "experience"; id: string; experience: Doc<"experiences">; place: Doc<"places"> }
  | { kind: "place"; id: string; place: Doc<"places"> };
type Pick = { candidate: Candidate; title: string; why: string };

function overlap(tags: string[], vibes: Set<string>) {
  return tags.filter((t) => vibes.has(t.toLowerCase())).length;
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function validPicks(raw: unknown, allowed: Map<string, Candidate>): Pick[] | null {
  const options = (raw as { options?: unknown })?.options;
  if (!Array.isArray(options)) return null;
  const seen = new Set<string>();
  const picks: Pick[] = [];
  for (const option of options) {
    const { id, title, why } = (option ?? {}) as Record<string, unknown>;
    if (typeof id !== "string" || !allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    const candidate = allowed.get(id)!;
    const fallbackTitle = candidate.kind === "experience" ? candidate.experience.title : candidate.place.name;
    picks.push({
      candidate,
      title: typeof title === "string" && title.trim() ? title.trim() : fallbackTitle,
      why: typeof why === "string" && why.trim() ? why.trim() : FALLBACK_WHY,
    });
  }
  return picks.length === Math.min(3, allowed.size) ? picks : null;
}

export const generateSuggestions = internalAction({
  args: {
    planId: v.id("plans"),
    generation: v.optional(v.number()),
    excludePlaceIds: v.optional(v.array(v.id("places"))),
    excludeExperienceIds: v.optional(v.array(v.id("experiences"))),
    previousOptions: v.optional(v.array(optionValidator)),
  },
  handler: async (ctx, { planId, generation, excludePlaceIds, excludeExperienceIds, previousOptions }): Promise<null> => {
    const { plan, group, members, lowRatedPlaceIds, pot, experiences } = await ctx.runQuery(
      internal.context.planContext,
      { planId },
    );

    const balance = pot?.balance ?? 0;
    const people = Math.max(1, members.length);
    const budgetCap = Math.min(...members.map((m) => m.budgetMax));
    const diets = [...new Set(members.flatMap((m) => m.diet))];
    const vibes = new Set(members.flatMap((m) => m.vibes.map((t) => t.toLowerCase())));
    const homeArea = mostCommon(members.map((m) => m.homeArea));
    const excluded = new Set<string>(lowRatedPlaceIds);
    const rejectedPlaces = new Set<string>(excludePlaceIds);
    const rejectedExperiences = new Set<string>(excludeExperienceIds);

    const places = await ctx.runQuery(internal.places.listCandidates, {
      budgetMax: budgetCap,
      areas: members.map((m) => m.homeArea),
    });
    const placeById = new Map(places.map((p) => [p._id as string, p]));
    for (const e of experiences) {
      if (e.placeId && !placeById.has(e.placeId)) {
        const place = await ctx.runQuery(internal.context.getPlace, { placeId: e.placeId });
        if (place) placeById.set(place._id, place);
      }
    }

    const seedExperience = experiences.find(
      (e) => e._id === plan.seedExperienceId && !rejectedExperiences.has(e._id),
    );
    const seedPlace = seedExperience?.placeId ? placeById.get(seedExperience.placeId) : undefined;
    const seed: Candidate | null =
      seedExperience && seedPlace
        ? { kind: "experience", id: seedExperience._id, experience: seedExperience, place: seedPlace }
        : null;
    const otherSlots = seed ? 2 : 3;
    const experienceWhy = (e: Doc<"experiences">) => {
      const total = e.pricePerPerson * people;
      return total <= balance
        ? `Fits your $${balance} pot with $${balance - total} to spare.`
        : `Your pick: $${total} for the group, $${total - balance} more than your $${balance} pot.`;
    };
    const seedPick = (llmWhy?: string): Pick[] =>
      seed?.kind === "experience"
        ? [
            {
              candidate: seed,
              title: seed.experience.title,
              why:
                llmWhy && seed.experience.pricePerPerson * people <= balance ? llmWhy : experienceWhy(seed.experience),
            },
          ]
        : [];

    const experienceCandidates: Candidate[] = experiences
      .filter(
        (e) =>
          e._id !== seed?.id &&
          !rejectedExperiences.has(e._id) &&
          e.placeId &&
          placeById.has(e.placeId) &&
          !excluded.has(e.placeId) &&
          e.minGroup <= people &&
          people <= e.maxGroup &&
          e.pricePerPerson * people <= balance,
      )
      .sort((a, b) => overlap(b.tags, vibes) - overlap(a.tags, vibes) || a.pricePerPerson - b.pricePerPerson)
      .map((e) => ({ kind: "experience", id: e._id, experience: e, place: placeById.get(e.placeId!)! }));
    const placeSlots = Math.max(MAX_PLACES, otherSlots - experienceCandidates.length);
    const placeCandidates: Candidate[] = places
      .filter((p) => p.priceLevel === 1 && !excluded.has(p._id) && !rejectedPlaces.has(p._id))
      .sort((a, b) => overlap(b.tags, vibes) - overlap(a.tags, vibes))
      .slice(0, placeSlots + 2)
      .map((p) => ({ kind: "place", id: p._id, place: p }));
    const candidates = [...(seed ? [seed] : []), ...experienceCandidates.slice(0, 12), ...placeCandidates];
    const allowed = new Map(candidates.map((c) => [c.id, c]));

    const memories = await ctx.runAction(internal.memory.getGroupContext, { groupId: group._id });

    let picks: Pick[] | null = null;
    try {
      const raw = await chatJSON(SYSTEM_PROMPT, {
        WINDOW: {
          start: new Date(plan.window.start).toISOString(),
          end: new Date(plan.window.end).toISOString(),
          timezone: "America/Los_Angeles",
        },
        POT: { balance, members: people },
        SEED: seed?.id ?? null,
        DIETS: diets,
        MAX_PLACES: placeSlots,
        CANDIDATES: candidates.map((c) =>
          c.kind === "experience"
            ? {
                id: c.id,
                kind: "experience",
                title: c.experience.title,
                description: c.experience.description,
                pricePerPerson: c.experience.pricePerPerson,
                groupTotal: c.experience.pricePerPerson * people,
                leftInPot: balance - c.experience.pricePerPerson * people,
                tags: c.experience.tags,
                area: c.place.area,
              }
            : { id: c.id, kind: "place", name: c.place.name, area: c.place.area, category: c.place.category, tags: c.place.tags },
        ),
        MEMORIES: memories,
      });
      picks = validPicks(raw, allowed);
      if (picks && picks.filter((p) => p.candidate.kind === "place").length > placeSlots) picks = null;
      if (picks && seed) {
        const others = picks.filter((p) => p.candidate.id !== seed.id);
        picks = [...seedPick(picks.find((p) => p.candidate.id === seed.id)?.why), ...others.slice(0, otherSlots)];
      }
      if (!picks) console.warn("LLM returned unusable options, using fallback", raw);
    } catch (err) {
      console.warn("LLM call failed, using fallback", err);
    }

    picks ??= [
      ...seedPick(),
      ...[
        ...experienceCandidates.slice(0, otherSlots - Math.min(placeSlots, placeCandidates.length, 1)),
        ...placeCandidates,
      ]
        .slice(0, otherSlots)
        .map((candidate) => ({
          candidate,
          title: candidate.kind === "experience" ? candidate.experience.title : candidate.place.name,
          why: candidate.kind === "experience" ? experienceWhy(candidate.experience) : FALLBACK_WHY,
        })),
    ];

    const options = picks.map(({ candidate, title, why }) => {
      const place = candidate.place;
      const base = { placeId: place._id, title, why, travel: travelEstimate(homeArea, place) };
      if (candidate.kind === "experience") {
        const price = candidate.experience.pricePerPerson;
        return { ...base, costMin: price, costMax: price, experienceId: candidate.experience._id };
      }
      const { min, max } = priceRange(place.priceLevel);
      return { ...base, costMin: min, costMax: max };
    });

    await ctx.runMutation(internal.plans.saveOptions, { planId, options, generation, previousOptions });
    return null;
  },
});
