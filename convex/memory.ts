"use node";

import { v } from "convex/values";
import { Supermemory } from "supermemory";
import type { AddRequestMetadataValue, FilterExpression } from "supermemory";
import { action, env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { SWIPE_TAGS } from "./taste";

const userTag = (userId: Id<"users">) => `user_${userId}`;
const groupTag = (groupId: Id<"groups">) => `group_${groupId}`;
const norm = (term: string) => term.trim().toLowerCase();

const SEARCH_LIMIT = 5;
const MAX_SEARCHES = 10;
const MAX_IDEAS = 10;
const MAX_CATEGORIES = 3;
const PER_IDEA = 3;
const GENERAL = 5;
const MAX_SHARED = 2;
const MAX_CHARS = 200;

export type MemoryMeta = {
  kind: "swipe" | "preferences" | "rating" | "pass" | "checkin";
  category?: string;
  tags?: string[];
  placeId?: string;
  experienceId?: string;
  stars?: number;
  at: number;
};

type Hit = { text: string; similarity: number; tags: string[] };

function client() {
  return new Supermemory({ apiKey: env.SUPERMEMORY_API_KEY, timeoutInSeconds: 20 });
}

function toMetadata(meta: MemoryMeta): Record<string, AddRequestMetadataValue> {
  const { category, tags, ...rest } = meta;
  const out: Record<string, AddRequestMetadataValue> = { tags: [...new Set((tags ?? []).map(norm))] };
  if (category) out.category = norm(category);
  for (const [key, value] of Object.entries(rest)) if (value !== undefined) out[key] = value;
  return out;
}

async function remember(tag: string, content: string, meta: MemoryMeta) {
  await client().add(tag, { content, dreaming: "instant", metadata: toMetadata(meta) });
}

async function searchHits(tag: string, query: string, limit: number, filter?: FilterExpression): Promise<Hit[]> {
  try {
    const { results } = await client().search(tag, { query, limit, ...(filter ? { filter } : {}) });
    return results
      .map((r) => ({
        text: (r.memory ?? r.chunk ?? "").trim(),
        similarity: r.similarity ?? 0,
        tags: Array.isArray(r.metadata?.tags) ? r.metadata.tags.filter((t): t is string => typeof t === "string") : [],
      }))
      .filter((hit) => hit.text.length > 0)
      .slice(0, limit);
  } catch (err) {
    console.warn(`Supermemory search failed for ${tag}`, err);
    return [];
  }
}

async function searchMemories(tag: string, query: string, limit: number): Promise<string[]> {
  return (await searchHits(tag, query, limit)).map((hit) => hit.text);
}

async function profileFacts(tag: string): Promise<string[]> {
  try {
    const { profile } = await client().profile(tag);
    return [...profile.static, ...profile.dynamic].map((item) => item.memory);
  } catch (err) {
    console.warn(`Supermemory profile failed for ${tag}`, err);
    return [];
  }
}

function preferenceSentence(user: Doc<"users">): string {
  const diet = user.diet.length > 0 ? user.diet.join(", ") : "no diet restrictions";
  const vibes = user.vibes.length > 0 ? ` Likes ${user.vibes.join(", ")} vibes.` : "";
  return `Budget max $${user.budgetMax}, ${diet}, lives in ${user.homeArea}.${vibes}`;
}

export const rememberSwipe = action({
  args: {
    userId: v.id("users"),
    chosen: v.string(),
    rejected: v.string(),
    category: v.string(),
  },
  handler: async (ctx, { userId, chosen, rejected, category }) => {
    await ctx.runMutation(internal.taste.recordSwipe, { userId, chosen, rejected, category });
    await remember(userTag(userId), `Prefers ${chosen} over ${rejected} (${category}).`, {
      kind: "swipe",
      category,
      tags: SWIPE_TAGS[chosen] ?? [],
      at: Date.now(),
    });
    return null;
  },
});

export const rememberPreferences = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.runQuery(internal.context.getUser, { userId });
    if (!user) return null;
    await remember(userTag(userId), preferenceSentence(user), { kind: "preferences", tags: user.vibes, at: Date.now() });
    return null;
  },
});

export const rememberRating = internalAction({
  args: { ratingId: v.id("ratings") },
  handler: async (ctx, { ratingId }) => {
    const rating = await ctx.runQuery(internal.context.ratingContext, { ratingId });
    if (!rating?.groupId) return null;
    const sentence = `Rated ${rating.placeName} ${rating.stars} stars, vibe: ${rating.vibe}.`;
    const meta: MemoryMeta = {
      kind: "rating",
      category: rating.category,
      tags: rating.tags,
      placeId: rating.placeId,
      experienceId: rating.experienceId,
      stars: rating.stars,
      at: Date.now(),
    };
    await Promise.all([
      remember(userTag(rating.userId), sentence, meta),
      remember(groupTag(rating.groupId), `${rating.userName} ${sentence[0].toLowerCase()}${sentence.slice(1)}`, meta),
    ]);
    return null;
  },
});

export const rememberRejection = internalAction({
  args: { groupId: v.id("groups"), userIds: v.array(v.id("users")), titles: v.array(v.string()) },
  handler: async (ctx, { groupId, userIds, titles }) => {
    const users = await ctx.runQuery(internal.users.getMany, { userIds });
    if (users.length === 0 || titles.length === 0) return null;
    const ideas = await ctx.runQuery(internal.context.ideasByTitle, { titles });
    const names = users.map((u) => u.name).join(", ");
    const at = Date.now();
    await Promise.all(
      ideas.flatMap(({ title, ...idea }) => {
        const meta: MemoryMeta = { kind: "pass", ...idea, at };
        return [
          ...users.map((u) => remember(userTag(u._id), `Passed on ${title}: not interested.`, meta)),
          remember(groupTag(groupId), `${names} passed on ${title}.`, meta),
        ];
      }),
    );
    return null;
  },
});

export const rememberCheckin = internalAction({
  args: { photoId: v.id("photos") },
  handler: async (ctx, { photoId }) => {
    const checkin = await ctx.runQuery(internal.context.checkinContext, { photoId });
    if (!checkin) return null;
    const caption = checkin.caption ? `: "${checkin.caption.slice(0, 120)}"` : ".";
    const meta: MemoryMeta = {
      kind: "checkin",
      category: checkin.category,
      tags: checkin.tags,
      placeId: checkin.placeId,
      experienceId: checkin.experienceId,
      at: checkin.at,
    };
    await Promise.all([
      remember(userTag(checkin.userId), `Checked in at ${checkin.title} with the crew${caption}`, meta),
      remember(groupTag(checkin.groupId), `${checkin.userName} checked in at ${checkin.title}${caption}`, meta),
    ]);
    return null;
  },
});

export const contextForIdeas = internalAction({
  args: {
    userId: v.optional(v.id("users")),
    groupId: v.optional(v.id("groups")),
    ideas: v.array(
      v.object({ key: v.string(), title: v.string(), category: v.optional(v.string()), tags: v.array(v.string()) }),
    ),
  },
  handler: async (_ctx, { userId, groupId, ideas }): Promise<{ byIdea: Record<string, string[]>; general: string[] }> => {
    const byIdea: Record<string, string[]> = Object.fromEntries(ideas.map((idea) => [idea.key, []]));
    const containers = [...(userId ? [userTag(userId)] : []), ...(groupId ? [groupTag(groupId)] : [])];
    if (containers.length === 0 || ideas.length === 0) return { byIdea, general: [] };

    const top = ideas.slice(0, MAX_IDEAS).map((idea) => ({ ...idea, category: idea.category && norm(idea.category), tags: idea.tags.map(norm) }));
    const categories = [...new Set(top.flatMap((idea) => (idea.category ? [idea.category] : [])))].slice(0, MAX_CATEGORIES);
    type Job = { tag: string; query: string; filter?: FilterExpression; ideas: typeof top };
    const byCategory = (tag: string): Job[] =>
      categories.map((category) => {
        const inCategory = top.filter((idea) => idea.category === category);
        return {
          tag,
          query: `${category}: ${inCategory.map((idea) => idea.title).join(", ")}`,
          filter: { field: "category", operator: "eq", value: category },
          ideas: inCategory,
        };
      });
    const [primary, ...others] = containers;
    const jobs: Job[] = [
      ...containers.map((tag) => ({ tag, query: "favorite outings, likes, dislikes and passes", ideas: [] })),
      ...byCategory(primary),
      ...top.map((idea) => ({ tag: primary, query: [idea.title, ...idea.tags.slice(0, 4)].join(" "), ideas: [idea] })),
      ...others.flatMap(byCategory),
    ].slice(0, MAX_SEARCHES);

    const best = new Map<string, { text: string; similarity: number; keys: Set<string> }>();
    const results = await Promise.all(jobs.map((job) => searchHits(job.tag, job.query, SEARCH_LIMIT, job.filter)));
    results.forEach((hits, i) => {
      const job = jobs[i];
      for (const hit of hits) {
        const text = hit.text.length > MAX_CHARS ? `${hit.text.slice(0, MAX_CHARS - 1)}…` : hit.text;
        const id = norm(text).replace(/[^a-z0-9]+/g, " ").trim();
        const lower = norm(hit.text);
        const matched =
          job.ideas.length === 1
            ? job.ideas
            : job.ideas.filter((idea) => lower.includes(norm(idea.title)) || hit.tags.some((t) => idea.tags.includes(norm(t))));
        const entry = best.get(id) ?? { text, similarity: hit.similarity, keys: new Set<string>() };
        entry.similarity = Math.max(entry.similarity, hit.similarity);
        for (const idea of matched) entry.keys.add(idea.key);
        best.set(id, entry);
      }
    });

    const ranked = [...best.values()].sort((a, b) => b.similarity - a.similarity);
    const general: string[] = [];
    for (const entry of ranked) {
      if (entry.keys.size === 0 || entry.keys.size > MAX_SHARED) {
        if (general.length < GENERAL) general.push(entry.text);
        continue;
      }
      for (const key of entry.keys) if (byIdea[key].length < PER_IDEA) byIdea[key].push(entry.text);
    }
    return { byIdea, general };
  },
});

export const getGroupContext = internalAction({
  args: { groupId: v.id("groups") },
  handler: async (
    ctx,
    { groupId },
  ): Promise<{ groupSummary: string; members: { name: string; memories: string[] }[] }> => {
    const data = await ctx.runQuery(internal.context.groupWithMembers, { groupId });
    if (!data) return { groupSummary: "", members: [] };

    const [groupFacts, members] = await Promise.all([
      profileFacts(groupTag(groupId)).then(async (facts) =>
        facts.length > 0 ? facts : await searchMemories(groupTag(groupId), "group outings and ratings", 8),
      ),
      Promise.all(
        data.members.map(async (m) => ({
          name: m.name,
          memories: await searchMemories(userTag(m._id), "outing preferences", 5),
        })),
      ),
    ]);
    return { groupSummary: groupFacts.join(" "), members };
  },
});

export const getMyProfile = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<string[]> => {
    const facts = await profileFacts(userTag(userId));
    const known = facts.length > 0 ? facts : await searchMemories(userTag(userId), "preferences and favorite outings", 8);
    if (known.length > 0) return [...new Set(known)].slice(0, 8);

    const user = await ctx.runQuery(internal.context.getUser, { userId });
    return user?.onboarded ? [preferenceSentence(user)] : [];
  },
});
