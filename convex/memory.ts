"use node";

import { v } from "convex/values";
import { Supermemory } from "supermemory";
import { action, env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

const userTag = (userId: Id<"users">) => `user_${userId}`;
const groupTag = (groupId: Id<"groups">) => `group_${groupId}`;

function client() {
  return new Supermemory({ apiKey: env.SUPERMEMORY_API_KEY, timeoutInSeconds: 20 });
}

async function remember(tag: string, content: string) {
  await client().add(tag, { content, dreaming: "instant" });
}

async function searchMemories(tag: string, query: string, limit: number): Promise<string[]> {
  try {
    const { results } = await client().search(tag, { query, limit });
    return results
      .map((r) => r.memory ?? r.chunk ?? "")
      .filter((text) => text.length > 0)
      .slice(0, limit);
  } catch (err) {
    console.warn(`Supermemory search failed for ${tag}`, err);
    return [];
  }
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
  handler: async (_ctx, { userId, chosen, rejected, category }) => {
    await remember(userTag(userId), `Prefers ${chosen} over ${rejected} (${category}).`);
    return null;
  },
});

export const rememberPreferences = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.runQuery(internal.context.getUser, { userId });
    if (!user) return null;
    await remember(userTag(userId), preferenceSentence(user));
    return null;
  },
});

export const rememberRating = internalAction({
  args: { ratingId: v.id("ratings") },
  handler: async (ctx, { ratingId }) => {
    const rating = await ctx.runQuery(internal.context.ratingContext, { ratingId });
    if (!rating?.groupId) return null;
    const sentence = `Rated ${rating.placeName} ${rating.stars} stars, vibe: ${rating.vibe}.`;
    await Promise.all([
      remember(userTag(rating.userId), sentence),
      remember(groupTag(rating.groupId), `${rating.userName} ${sentence[0].toLowerCase()}${sentence.slice(1)}`),
    ]);
    return null;
  },
});

export const rememberRejection = internalAction({
  args: { groupId: v.id("groups"), userIds: v.array(v.id("users")), titles: v.array(v.string()) },
  handler: async (ctx, { groupId, userIds, titles }) => {
    const users = await ctx.runQuery(internal.users.getMany, { userIds });
    if (users.length === 0 || titles.length === 0) return null;
    const sentence = `Passed on ${titles.join(", ")}: not interested in these.`;
    await Promise.all([
      ...users.map((u) => remember(userTag(u._id), sentence)),
      remember(groupTag(groupId), `${users.map((u) => u.name).join(", ")} passed on ${titles.join(", ")}.`),
    ]);
    return null;
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
