import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, MutationCtx, QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { chatJSON } from "./llm";
import { DAY } from "./time";

export const NOVEL_MAX = 40;
export const FALLBACK_NOVEL_POINTS = 25;
const FALLBACK_WINDOW = 30 * DAY;
const SCORE_TTL = DAY;
const TOP_VIBES = 6;
const MAX_IDEAS = 20;

export type Novelty = { points: number; score: number; reason: string | null; source: "ai" | "fallback" };

export function planIdeaKey(plan: Doc<"plans">): string | null {
  const winner = plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
  if (!winner) return null;
  return winner.experienceId ? `exp:${winner.experienceId}` : `place:${winner.placeId}`;
}

export async function ideaDetails(ctx: QueryCtx, ideaKey: string) {
  const [kind, raw] = [ideaKey.slice(0, ideaKey.indexOf(":")), ideaKey.slice(ideaKey.indexOf(":") + 1)];
  if (kind === "place") {
    const id = ctx.db.normalizeId("places", raw);
    const place = id ? await ctx.db.get("places", id) : null;
    return place ? { title: place.name, description: "", category: place.category, tags: place.tags } : null;
  }
  if (kind === "exp") {
    const id = ctx.db.normalizeId("experiences", raw);
    const exp = id ? await ctx.db.get("experiences", id) : null;
    if (!exp) return null;
    const place = exp.placeId ? await ctx.db.get("places", exp.placeId) : null;
    return {
      title: exp.title,
      description: exp.description,
      category: place?.category,
      tags: [...exp.tags, ...(place?.tags ?? [])],
    };
  }
  return null;
}

const norm = (term: string) => term.trim().toLowerCase();

async function checkinCategory(ctx: QueryCtx, planId: Id<"plans">) {
  const plan = await ctx.db.get("plans", planId);
  const key = plan ? planIdeaKey(plan) : null;
  return key ? (await ideaDetails(ctx, key))?.category : undefined;
}

async function fallbackNovelty(
  ctx: QueryCtx,
  userId: Id<"users">,
  ideaKey: string,
  excludePlanId?: Id<"plans">,
): Promise<Novelty> {
  const none: Novelty = { points: 0, score: 0, reason: null, source: "fallback" };
  const idea = await ideaDetails(ctx, ideaKey);
  if (!idea) return none;
  const scores = new Map<string, number>();
  const bump = (term: string, by: number) => {
    if (norm(term)) scores.set(norm(term), (scores.get(norm(term)) ?? 0) + by);
  };
  const user = await ctx.db.get("users", userId);
  for (const vibe of user?.vibes ?? []) bump(vibe, 3);
  const ratings = await ctx.db
    .query("ratings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const rating of ratings) {
    if (rating.stars < 4) continue;
    bump(rating.vibe, 1);
    const plan = rating.planId ? await ctx.db.get("plans", rating.planId) : null;
    const key = plan ? planIdeaKey(plan) : null;
    const rated = key ? await ideaDetails(ctx, key) : null;
    for (const term of rated ? [rated.category ?? "", ...rated.tags] : []) bump(term, 1);
  }
  const top = [...scores]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_VIBES)
    .map(([term]) => term);
  if ([idea.category ?? "", ...idea.tags].some((term) => top.includes(norm(term)))) return none;

  if (idea.category) {
    const since = Date.now() - FALLBACK_WINDOW;
    const events = await ctx.db
      .query("pointEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const event of events) {
      if (event.reason !== "checkin" || !event.planId || event.planId === excludePlanId) continue;
      if (event._creationTime < since) continue;
      if (norm((await checkinCategory(ctx, event.planId)) ?? "") === norm(idea.category)) return none;
    }
  }
  const usual = top.slice(0, 3).join(", ");
  return {
    points: FALLBACK_NOVEL_POINTS,
    score: FALLBACK_NOVEL_POINTS / NOVEL_MAX,
    reason: usual ? `New for you: you usually go for ${usual}.` : "New for you.",
    source: "fallback",
  };
}

export function cleanScore(score: unknown): number | null {
  return typeof score === "number" && Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : null;
}

async function cachedScore(ctx: QueryCtx, userId: Id<"users">, ideaKey: string) {
  return await ctx.db
    .query("noveltyScores")
    .withIndex("by_user_idea", (q) => q.eq("userId", userId).eq("ideaKey", ideaKey))
    .unique();
}

export async function liveNovelty(
  ctx: QueryCtx,
  userId: Id<"users">,
  ideaKey: string,
  excludePlanId?: Id<"plans">,
): Promise<Novelty> {
  const cached = await cachedScore(ctx, userId, ideaKey);
  const score = cleanScore(cached?.score);
  if (cached && score !== null) {
    return { points: Math.round(score * NOVEL_MAX), score, reason: cached.reason, source: "ai" };
  }
  return await fallbackNovelty(ctx, userId, ideaKey, excludePlanId);
}

export async function findQuote(ctx: QueryCtx, userId: Id<"users">, planId: Id<"plans">) {
  return await ctx.db
    .query("gojiQuotes")
    .withIndex("by_user_plan", (q) => q.eq("userId", userId).eq("planId", planId))
    .unique();
}

const quoteNovelty = (quote: Doc<"gojiQuotes">): Novelty => ({
  points: quote.points,
  score: quote.score,
  reason: quote.reason,
  source: quote.source,
});

export async function lockQuote(ctx: MutationCtx, userId: Id<"users">, plan: Doc<"plans">): Promise<Novelty> {
  const existing = await findQuote(ctx, userId, plan._id);
  if (existing) return quoteNovelty(existing);
  const ideaKey = planIdeaKey(plan);
  if (!ideaKey) return { points: 0, score: 0, reason: null, source: "fallback" };
  const novelty = await liveNovelty(ctx, userId, ideaKey, plan._id);
  await ctx.db.insert("gojiQuotes", { userId, planId: plan._id, ideaKey, ...novelty });
  return novelty;
}

export async function quotedOrLive(ctx: QueryCtx, userId: Id<"users">, ideaKey: string, plan: Doc<"plans"> | null) {
  const quote = plan ? await findQuote(ctx, userId, plan._id) : null;
  return quote ? quoteNovelty(quote) : await liveNovelty(ctx, userId, ideaKey, plan?._id);
}

export async function userGroups(ctx: QueryCtx, userId: Id<"users">) {
  return (await ctx.db.query("groups").collect()).filter((g) => g.memberIds.includes(userId));
}

// The user's newest locked or done plan for this idea that they haven't checked in to yet.
export async function openPlanFor(ctx: QueryCtx, userId: Id<"users">, ideaKey: string, checkedIn: Set<Id<"plans">>) {
  let found: Doc<"plans"> | null = null;
  for (const group of await userGroups(ctx, userId)) {
    const plans = await ctx.db
      .query("plans")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    for (const plan of plans) {
      if (plan.status !== "locked" && plan.status !== "done") continue;
      if (checkedIn.has(plan._id) || planIdeaKey(plan) !== ideaKey) continue;
      if (!found || plan.window.start > found.window.start) found = plan;
    }
  }
  return found;
}

export async function checkedInPlanIds(ctx: QueryCtx, userId: Id<"users">) {
  const events = await ctx.db
    .query("pointEvents")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Set(events.flatMap((e) => (e.reason === "checkin" && e.planId ? [e.planId] : [])));
}

// Freeze the cached AI score into a quote for every open plan on these ideas,
// so a later cache refresh can't change what the user was already shown.
async function snapshotCachedQuotes(ctx: MutationCtx, userId: Id<"users">, ideaKeys: string[]) {
  const checkedIn = await checkedInPlanIds(ctx, userId);
  for (const ideaKey of ideaKeys) {
    const plan = await openPlanFor(ctx, userId, ideaKey, checkedIn);
    if (!plan || (await findQuote(ctx, userId, plan._id))) continue;
    const cached = await cachedScore(ctx, userId, ideaKey);
    if (cached && cleanScore(cached.score) !== null) await lockQuote(ctx, userId, plan);
  }
}

const ideaKeyList = (ideaKeys: string[]) =>
  [...new Set(ideaKeys.filter((key) => /^(exp|place):.+/.test(key)))].slice(0, MAX_IDEAS);

export const requestScores = mutation({
  args: { userId: v.id("users"), ideaKeys: v.array(v.string()) },
  handler: async (ctx, { userId, ideaKeys }) => {
    if (!(await ctx.db.get("users", userId))) throw new ConvexError("User not found");
    const keys = ideaKeyList(ideaKeys);
    await snapshotCachedQuotes(ctx, userId, keys);
    const stale: string[] = [];
    for (const key of keys) {
      const cached = await cachedScore(ctx, userId, key);
      if (!cached || Date.now() - cached.computedAt > SCORE_TTL) stale.push(key);
    }
    if (stale.length > 0) await ctx.scheduler.runAfter(0, internal.novelty.scoreIdeas, { userId, ideaKeys: stale });
    return { scheduled: stale.length };
  },
});

export const scoringContext = internalQuery({
  args: { userId: v.id("users"), ideaKeys: v.array(v.string()) },
  handler: async (ctx, { userId, ideaKeys }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    const ideas = [];
    for (const ideaKey of ideaKeys) {
      const idea = await ideaDetails(ctx, ideaKey);
      if (idea) ideas.push({ ideaKey, ...idea });
    }
    const events = await ctx.db
      .query("pointEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    const recentCheckins = [];
    for (const event of events) {
      if (event.reason !== "checkin" || !event.planId || recentCheckins.length >= 15) continue;
      const plan = await ctx.db.get("plans", event.planId);
      const key = plan ? planIdeaKey(plan) : null;
      const idea = key ? await ideaDetails(ctx, key) : null;
      if (idea) {
        recentCheckins.push({
          title: idea.title,
          category: idea.category,
          daysAgo: Math.floor((Date.now() - event._creationTime) / DAY),
        });
      }
    }
    return { vibes: user.vibes, diet: user.diet, ideas, recentCheckins };
  },
});

const SYSTEM = `You rate how novel each outing idea would be for ONE person, given their taste and recent outings.
Score 0 to 1: 1 = something they've never done and is outside their usual taste, 0 = exactly their usual.
Return JSON: {"scores":[{"ideaKey":"<as given>","score":0.0,"reason":"<one short line, under 90 characters, that mentions their own taste>"}]}.
Score every idea exactly once and use the ideaKey values exactly as given.`;

export const scoreIdeas = internalAction({
  args: { userId: v.id("users"), ideaKeys: v.array(v.string()) },
  handler: async (ctx, { userId, ideaKeys }) => {
    const context = await ctx.runQuery(internal.novelty.scoringContext, { userId, ideaKeys });
    if (!context || context.ideas.length === 0) return null;
    let profile: string[] = [];
    try {
      profile = await ctx.runAction(api.memory.getMyProfile, { userId });
    } catch (err) {
      console.warn("Novelty: memory profile failed", err);
    }
    let result: { scores?: { ideaKey?: unknown; score?: unknown; reason?: unknown }[] };
    try {
      result = await chatJSON(SYSTEM, {
        taste: { vibes: context.vibes, diet: context.diet, profile },
        recentCheckins: context.recentCheckins,
        ideas: context.ideas,
      });
    } catch (err) {
      console.warn("Novelty: scoring failed, keeping the fallback", err);
      return null;
    }
    const requested = new Set(context.ideas.map((idea) => idea.ideaKey));
    const scores = (Array.isArray(result?.scores) ? result.scores : []).flatMap((entry) => {
      const score = cleanScore(entry?.score);
      if (typeof entry?.ideaKey !== "string" || !requested.has(entry.ideaKey) || score === null) return [];
      const reason = typeof entry.reason === "string" ? entry.reason.trim().slice(0, 140) : "";
      return [{ ideaKey: entry.ideaKey, score, reason }];
    });
    if (scores.length > 0) await ctx.runMutation(internal.novelty.saveScores, { userId, scores });
    return null;
  },
});

export const saveScores = internalMutation({
  args: {
    userId: v.id("users"),
    scores: v.array(v.object({ ideaKey: v.string(), score: v.number(), reason: v.string() })),
  },
  handler: async (ctx, { userId, scores }) => {
    const keys = scores.map((s) => s.ideaKey);
    await snapshotCachedQuotes(ctx, userId, keys);
    for (const { ideaKey, score, reason } of scores) {
      const clean = cleanScore(score);
      if (clean === null) continue;
      const cached = await cachedScore(ctx, userId, ideaKey);
      const doc = { userId, ideaKey, score: clean, reason, computedAt: Date.now() };
      if (cached) await ctx.db.replace("noveltyScores", cached._id, doc);
      else await ctx.db.insert("noveltyScores", doc);
    }
    await snapshotCachedQuotes(ctx, userId, keys);
    return null;
  },
});
