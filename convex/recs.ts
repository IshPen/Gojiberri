import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { potLedger, shareCents } from "./funds";
import { ideaDetails, planIdeaKey } from "./novelty";
import { CAMPUS_CENTERS, DEFAULT_CAMPUS, distanceKm } from "./places";
import { fitsBudget, priceRange } from "./pricing";
import { addDays, DAY, localDate, localTime } from "./time";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const PLACE_RADIUS_KM = 25;
const NEAR_KM = 5;
const FAR_KM = 15;
const DISTANCE_WEIGHT = 0.5;
const BUDGET_WEIGHT = 0.1;
const PARTNER_BOOST = 0.25;
const PARTNER_TIEBREAK = 0.05;
const RECENT_PENALTY = 0.6;
const ROTATION_BAND = 0.08;
const MIN_STRETCH_FIT = 1 / 3;
const STRETCH_EVERY = 3;
const RECENT_DAYS = 14;
const NOVELTY_DAYS = 30;

const norm = (term: string) => term.trim().toLowerCase();
const label = (tag: string) => tag.replace(/-/g, " ");
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

function listOf(items: string[]) {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function sentence(clauses: string[]) {
  const text = listOf(clauses);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function hash01(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 2 ** 32;
}

function distanceFactor(km: number) {
  if (km <= NEAR_KM) return 1;
  if (km <= FAR_KM) return 1 - (0.5 * (km - NEAR_KM)) / (FAR_KM - NEAR_KM);
  return 0.5 * Math.exp(-(km - FAR_KM) / 5);
}

const recValidator = v.object({
  kind: v.union(v.literal("experience"), v.literal("place")),
  id: v.union(v.id("experiences"), v.id("places")),
  title: v.string(),
  businessName: v.optional(v.string()),
  pricePerPerson: v.optional(v.number()),
  priceLevel: v.optional(v.number()),
  distanceKm: v.union(v.number(), v.null()),
  tags: v.array(v.string()),
  score: v.number(),
  slot: v.union(v.literal("safe"), v.literal("stretch")),
  reason: v.string(),
  partner: v.boolean(),
});

type Candidate = {
  kind: "experience" | "place";
  id: Id<"experiences"> | Id<"places">;
  key: string;
  title: string;
  businessName?: string;
  pricePerPerson?: number;
  priceLevel?: number;
  cost: number;
  tags: string[];
  category?: string;
  location?: { lat: number; lng: number };
  partner: boolean;
};

export const forYou = query({
  args: {
    userId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    limit: v.optional(v.number()),
    day: v.optional(v.string()),
  },
  returns: v.array(recValidator),
  handler: async (ctx, { userId, groupId, limit, day }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return [];
    const today = day ?? localDate(Date.now());
    const dayEnd = localTime(addDays(today, 1), 0);
    const campus = CAMPUS_CENTERS[user.homeArea] ?? CAMPUS_CENTERS[DEFAULT_CAMPUS];

    const group = groupId ? await ctx.db.get("groups", groupId) : null;
    const pot = group
      ? await ctx.db
          .query("pots")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .first()
      : null;
    const potShare = pot ? shareCents(await potLedger(ctx, pot._id), userId) : null;
    const budget = potShare ? (potShare.contributed - potShare.spent) / 100 : user.budgetMax;

    const recentKeys = new Set<string>();
    const recentCategories = new Set<string>();
    const checkins = await ctx.db
      .query("pointEvents")
      .withIndex("by_user", (q) =>
        q.eq("userId", userId).gte("_creationTime", dayEnd - NOVELTY_DAYS * DAY).lt("_creationTime", dayEnd),
      )
      .collect();
    for (const event of checkins) {
      if (event.reason !== "checkin" || !event.planId) continue;
      const plan = await ctx.db.get("plans", event.planId);
      const winner = plan?.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
      if (!winner) continue;
      const place = await ctx.db.get("places", winner.placeId);
      if (place) recentCategories.add(place.category);
      if (event._creationTime < dayEnd - RECENT_DAYS * DAY) continue;
      recentKeys.add(`place:${winner.placeId}`);
      if (winner.experienceId) recentKeys.add(`exp:${winner.experienceId}`);
    }

    const likes = new Set(user.vibes.map(norm));
    const diets = user.diet.map(norm);
    const lovedTags = new Set<string>();
    const badTags = new Set<string>();
    const ratings = await ctx.db
      .query("ratings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const rating of ratings) {
      if (rating.stars > 2 && rating.stars < 4) continue;
      const plan = rating.planId ? await ctx.db.get("plans", rating.planId) : null;
      const key = plan ? planIdeaKey(plan) : null;
      const rated = key ? await ideaDetails(ctx, key) : null;
      for (const tag of rated?.tags ?? []) (rating.stars <= 2 ? badTags : lovedTags).add(norm(tag));
    }
    const dislikes = new Set(
      [...badTags].filter((t) => !lovedTags.has(t) && !likes.has(t) && !diets.some((d) => t.startsWith(d))),
    );

    const candidates: Candidate[] = [];
    const experiencePlaces = new Set<string>();
    for (const e of await ctx.db.query("experiences").take(500)) {
      if (!e.active) continue;
      if (group && (group.memberIds.length < e.minGroup || group.memberIds.length > e.maxGroup)) continue;
      const [place, business] = await Promise.all([
        e.placeId ? ctx.db.get("places", e.placeId) : null,
        ctx.db.get("businesses", e.businessId),
      ]);
      if (place) experiencePlaces.add(place._id);
      if (place && distanceKm(campus, place) > PLACE_RADIUS_KM) continue;
      candidates.push({
        kind: "experience",
        id: e._id,
        key: `exp:${e._id}`,
        title: e.title,
        businessName: business?.name,
        pricePerPerson: e.pricePerPerson,
        cost: e.pricePerPerson,
        tags: [...new Set([...e.tags, ...(place?.tags ?? [])].map(norm))],
        category: place?.category,
        location: place ?? undefined,
        partner: true,
      });
    }
    for (const place of await ctx.db.query("places").take(1000)) {
      if (experiencePlaces.has(place._id) || distanceKm(campus, place) > PLACE_RADIUS_KM) continue;
      candidates.push({
        kind: "place",
        id: place._id,
        key: `place:${place._id}`,
        title: place.name,
        priceLevel: place.priceLevel,
        cost: priceRange(place.priceLevel).min,
        tags: [...new Set(place.tags.map(norm))],
        category: place.category,
        location: place,
        partner: false,
      });
    }

    const scored = candidates
      .filter((c) => (c.kind === "experience" ? c.cost <= budget : fitsBudget(c.priceLevel ?? 1, budget)))
      .filter((c) => !c.tags.some((t) => dislikes.has(t)))
      .map((c) => {
        const matchedVibes = c.tags.filter((t) => likes.has(t));
        const matchedDiet = c.tags.filter((t) => diets.some((d) => t === d || t === `${d}-friendly`));
        const fit = Math.min(new Set([...matchedVibes, ...matchedDiet]).size, 3) / 3;
        const km = c.location ? distanceKm(campus, c.location) : null;
        const headroom = budget > 0 ? Math.max(0, 1 - c.cost / budget) : 0;
        const recent = recentKeys.has(c.key);
        const score =
          fit +
          BUDGET_WEIGHT * headroom +
          DISTANCE_WEIGHT * (km === null ? 0.5 : distanceFactor(km)) +
          (c.partner ? (fit >= MIN_STRETCH_FIT ? PARTNER_BOOST : PARTNER_TIEBREAK) : 0) -
          (recent ? RECENT_PENALTY : 0) +
          ROTATION_BAND * hash01(`${userId}:${today}:${c.key}`);
        const unfamiliar = c.tags.filter((t) => !likes.has(t));
        const novelty =
          0.7 * (c.tags.length ? unfamiliar.length / c.tags.length : 1) +
          0.3 * (c.category && recentCategories.has(c.category) ? 0 : 1);
        return { c, fit, km, score, novelty, recent, matchedVibes, matchedDiet, unfamiliar };
      })
      .sort((a, b) => b.score - a.score || a.c.key.localeCompare(b.c.key));

    const count = Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit ?? DEFAULT_LIMIT)));
    const picked: { item: (typeof scored)[number]; slot: "safe" | "stretch" }[] = [];
    const used = new Set<string>();
    while (picked.length < count && used.size < scored.length) {
      const stretch =
        picked.length % STRETCH_EVERY === STRETCH_EVERY - 1
          ? scored
              .filter((s) => !used.has(s.c.key) && !s.recent && s.fit >= MIN_STRETCH_FIT && s.unfamiliar.length > 0)
              .sort((a, b) => b.novelty - a.novelty || b.score - a.score)[0]
          : undefined;
      const item = stretch ?? scored.find((s) => !used.has(s.c.key))!;
      used.add(item.c.key);
      picked.push({ item, slot: stretch ? "stretch" : "safe" });
    }

    return picked.map(({ item, slot }) => {
      const { c, km, matchedVibes, matchedDiet, unfamiliar } = item;
      const where = km === null ? [] : [`it's ${round(km, 1)} km from campus`];
      const reason =
        slot === "stretch"
          ? `Something new for you: ${listOf(unfamiliar.slice(0, 2).map(label))}. ${sentence([`you like ${label(matchedVibes[0] ?? matchedDiet[0])}`, ...where])}`
          : sentence([
              ...(matchedVibes.length ? [`you like ${listOf(matchedVibes.slice(0, 2).map(label))}`] : []),
              ...(matchedDiet.length ? [`it's ${label(matchedDiet[0])}`] : []),
              ...(matchedVibes.length || matchedDiet.length ? [] : [potShare ? "it fits your pot share" : `it fits your $${budget} budget`]),
              ...where,
            ]);
      return {
        kind: c.kind,
        id: c.id,
        title: c.title,
        businessName: c.businessName,
        pricePerPerson: c.pricePerPerson,
        priceLevel: c.priceLevel,
        distanceKm: km === null ? null : round(km, 1),
        tags: c.tags,
        score: round(item.score, 3),
        slot,
        reason,
        partner: c.partner,
      };
    });
  },
});
