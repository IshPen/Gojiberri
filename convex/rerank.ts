import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { chatJSON } from "./llm";
import { ideaDetails } from "./novelty";
import { localDate } from "./time";

export const MAX_RERANK = 10;
export const MAX_MOVE = 3;
const MAX_REASON = 160;

const slotValidator = v.union(v.literal("safe"), v.literal("stretch"));
const candidateValidator = v.object({
  key: v.string(),
  title: v.string(),
  category: v.optional(v.string()),
  tags: v.array(v.string()),
  baseScore: v.number(),
  slot: slotValidator,
});
const resultValidator = v.object({ key: v.string(), rank: v.number(), reason: v.union(v.string(), v.null()) });

type Candidate = typeof candidateValidator.type;
type Ranked = typeof resultValidator.type;

const SYSTEM = `You rerank outing ideas for one college student. You get up to ${MAX_RERANK} ideas in their current order, each with memories about this person and their crew from past swipes, ratings, passes and check-ins, plus general memories.
Return JSON {"ideas":[{"key":string,"reason":string}]} listing every key exactly once, best first.
Move an idea only when the memories give a reason to; ideas can move at most ${MAX_MOVE} places.
Each reason is one sentence under 120 characters, addressed to the person, starting with "You", and grounded in a specific memory, for example "You gave the last climbing gym 5 stars, and this one is closer."
Never invent facts that are not in the memories. If an idea has no relevant memory, base the reason on its tags, still starting with "You".`;

function baseOrder(candidates: Candidate[]): Ranked[] {
  return candidates.map((c, i) => ({ key: c.key, rank: i + 1, reason: null }));
}

function sameKeys(result: Ranked[], candidates: Candidate[]) {
  const keys = new Set(candidates.map((c) => c.key));
  return result.length === keys.size && result.every((r) => keys.has(r.key));
}

function feasible(positions: number[], bases: number[]) {
  const left = [...bases];
  for (const p of positions) {
    if (left.some((b) => b + MAX_MOVE < p)) return false;
    const ready = left.filter((b) => b - MAX_MOVE <= p);
    if (ready.length === 0) return false;
    left.splice(left.indexOf(Math.min(...ready)), 1);
  }
  return true;
}

function cleanReason(reason: unknown): string | null {
  if (typeof reason !== "string") return null;
  const text = reason.trim().replace(/\s+/g, " ");
  if (!/^you/i.test(text)) return null;
  return text.length > MAX_REASON ? `${text.slice(0, MAX_REASON - 1)}…` : text;
}

export function applyRerank(candidates: Candidate[], reply: unknown): Ranked[] {
  const proposed = (reply as { ideas?: unknown } | null)?.ideas;
  if (!Array.isArray(proposed)) throw new Error("Rerank reply has no ideas array");
  const top = candidates.slice(0, MAX_RERANK);
  const pref = new Map<string, number>();
  const reasons = new Map<string, string | null>();
  for (const item of proposed as { key?: unknown; reason?: unknown }[]) {
    if (typeof item?.key !== "string" || pref.has(item.key) || !top.some((c) => c.key === item.key)) continue;
    pref.set(item.key, pref.size);
    reasons.set(item.key, cleanReason(item.reason));
  }
  if (pref.size === 0) throw new Error("Rerank reply names no known ideas");
  const score = (i: number) => pref.get(top[i].key) ?? top.length + i;

  const order: number[] = new Array<number>(top.length);
  for (const slot of ["safe", "stretch"] as const) {
    const positions = top.flatMap((c, i) => (c.slot === slot ? [i] : []));
    const left = [...positions];
    positions.forEach((p, n) => {
      const choice = left
        .filter((b) => Math.abs(b - p) <= MAX_MOVE)
        .sort((a, b) => score(a) - score(b))
        .find((b) => feasible(positions.slice(n + 1), left.filter((x) => x !== b)))!;
      order[p] = choice;
      left.splice(left.indexOf(choice), 1);
    });
  }

  return [
    ...order.map((i, rank) => ({ key: top[i].key, rank: rank + 1, reason: reasons.get(top[i].key) ?? null })),
    ...candidates.slice(top.length).map((c, i) => ({ key: c.key, rank: top.length + i + 1, reason: null })),
  ];
}

export const cached = internalQuery({
  args: { userId: v.id("users"), day: v.string() },
  handler: async (ctx, { userId, day }) =>
    await ctx.db
      .query("rerankCache")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first(),
});

export const saveCache = internalMutation({
  args: { userId: v.id("users"), day: v.string(), groupId: v.optional(v.id("groups")), result: v.array(resultValidator) },
  handler: async (ctx, { userId, day, groupId, result }) => {
    const old = await ctx.db
      .query("rerankCache")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .take(10);
    for (const row of old) await ctx.db.delete("rerankCache", row._id);
    await ctx.db.insert("rerankCache", { userId, day, groupId, result, createdAt: Date.now() });
    return null;
  },
});

export const rerankForUser = internalAction({
  args: {
    userId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    day: v.optional(v.string()),
    candidates: v.array(candidateValidator),
  },
  returns: v.array(resultValidator),
  handler: async (ctx, { userId, groupId, day, candidates }): Promise<Ranked[]> => {
    const today = day ?? localDate(Date.now());
    const hit = await ctx.runQuery(internal.rerank.cached, { userId, day: today });
    if (hit && hit.groupId === groupId && sameKeys(hit.result, candidates)) return hit.result;
    const top = candidates.slice(0, MAX_RERANK);
    if (top.length === 0) return [];
    try {
      const memories = await ctx.runAction(internal.memory.contextForIdeas, {
        userId,
        groupId,
        ideas: top.map(({ key, title, category, tags }) => ({ key, title, category, tags })),
      });
      if (memories.general.length === 0 && Object.values(memories.byIdea).every((m) => m.length === 0)) {
        return baseOrder(candidates);
      }
      const reply = await chatJSON<unknown>(SYSTEM, {
        ideas: top.map((c, i) => ({
          key: c.key,
          rank: i + 1,
          title: c.title,
          category: c.category,
          tags: c.tags,
          slot: c.slot,
          memories: memories.byIdea[c.key] ?? [],
        })),
        generalMemories: memories.general,
      });
      const result = applyRerank(candidates, reply);
      await ctx.runMutation(internal.rerank.saveCache, { userId, day: today, groupId, result });
      return result;
    } catch (err) {
      console.warn(`Rerank failed for ${userId}`, err);
      return baseOrder(candidates);
    }
  },
});

export const getForYouOrder = query({
  args: { userId: v.id("users"), day: v.string() },
  returns: v.union(
    v.null(),
    v.object({ groupId: v.union(v.id("groups"), v.null()), result: v.array(resultValidator), createdAt: v.number() }),
  ),
  handler: async (ctx, { userId, day }) => {
    const row = await ctx.db
      .query("rerankCache")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();
    return row ? { groupId: row.groupId ?? null, result: row.result, createdAt: row.createdAt } : null;
  },
});

export const requestForYou = mutation({
  args: { userId: v.id("users"), groupId: v.optional(v.id("groups")), day: v.string() },
  returns: v.object({ scheduled: v.boolean() }),
  handler: async (ctx, { userId, groupId, day }) => {
    const recs = await ctx.runQuery(api.recs.forYou, { userId, groupId, day, limit: MAX_RERANK });
    if (recs.length === 0) return { scheduled: false };
    const candidates: Candidate[] = await Promise.all(
      recs.map(async (r) => {
        const key = `${r.kind === "experience" ? "exp" : "place"}:${r.id}`;
        const details = await ideaDetails(ctx, key);
        return { key, title: r.title, category: details?.category, tags: r.tags, baseScore: r.score, slot: r.slot };
      }),
    );
    const row = await ctx.db
      .query("rerankCache")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();
    if (row && row.groupId === groupId && sameKeys(row.result, candidates)) return { scheduled: false };
    await ctx.scheduler.runAfter(0, internal.rerank.rerankForUser, { userId, groupId, day, candidates });
    return { scheduled: true };
  },
});
