import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";

const timeBlock = v.object({ start: v.number(), end: v.number() });

export const createUser = mutation({
  args: { name: v.string(), avatarUrl: v.optional(v.string()) },
  handler: async (ctx, { name, avatarUrl }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");
    return await ctx.db.insert("users", {
      name: trimmed,
      avatarUrl,
      budgetMax: 30,
      homeArea: "Mission",
      diet: [],
      vibes: [],
      onboarded: false,
      points: 0,
      diamonds: 0,
      streak: 0,
      busyBlocks: [],
    });
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const updatePreferences = mutation({
  args: {
    userId: v.id("users"),
    budgetMax: v.number(),
    homeArea: v.string(),
    diet: v.array(v.string()),
    vibes: v.array(v.string()),
  },
  handler: async (ctx, { userId, ...prefs }) => {
    await ctx.db.patch(userId, { ...prefs, onboarded: true });
    return null;
  },
});

export const setBusyBlocks = mutation({
  args: { userId: v.id("users"), blocks: v.array(timeBlock) },
  handler: async (ctx, { userId, blocks }) => {
    await ctx.db.patch(userId, { busyBlocks: blocks.slice(0, 500) });
    return null;
  },
});

export const setPushToken = mutation({
  args: { userId: v.id("users"), token: v.string() },
  handler: async (ctx, { userId, token }) => {
    await ctx.db.patch(userId, { pushToken: token });
    return null;
  },
});

export const getInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const getMany = internalQuery({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    return users.filter((u) => u !== null);
  },
});

export const listAllIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(1000);
    return users.filter((u) => u.onboarded).map((u) => u._id);
  },
});
