import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

export async function withMembers(ctx: QueryCtx, group: Doc<"groups">) {
  const members = await Promise.all(group.memberIds.map((id) => ctx.db.get("users", id)));
  return {
    ...group,
    members: members
      .filter((m) => m !== null)
      .map((m) => ({ _id: m._id, name: m.name, avatarUrl: m.avatarUrl })),
  };
}

export const createGroup = mutation({
  args: { userId: v.id("users"), name: v.string() },
  handler: async (ctx, { userId, name }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) throw new ConvexError("User not found");
    let inviteCode = randomCode();
    while (
      await ctx.db
        .query("groups")
        .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
        .unique()
    ) {
      inviteCode = randomCode();
    }
    const groupId = await ctx.db.insert("groups", {
      name: name.trim() || `${user.name}'s crew`,
      inviteCode,
      ownerId: userId,
      memberIds: [userId],
    });
    return { groupId, inviteCode };
  },
});

export const joinGroup = mutation({
  args: { userId: v.id("users"), inviteCode: v.string() },
  handler: async (ctx, { userId, inviteCode }) => {
    const code = inviteCode.trim().toUpperCase();
    const group = await ctx.db
      .query("groups")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", code))
      .unique();
    if (!group) throw new ConvexError("Invalid invite code");
    if (!group.memberIds.includes(userId)) {
      await ctx.db.patch("groups", group._id, { memberIds: [...group.memberIds, userId] });
    }
    return group._id;
  },
});

export const getMyGroups = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const groups = await ctx.db.query("groups").order("desc").take(500);
    const mine = groups.filter((g) => g.memberIds.includes(userId));
    return await Promise.all(mine.map((g) => withMembers(ctx, g)));
  },
});

export const getGroup = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get("groups", groupId);
    return group ? await withMembers(ctx, group) : null;
  },
});

export const getInternal = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    return await ctx.db.get("groups", groupId);
  },
});

export const findByChat = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    const groups = await ctx.db.query("groups").take(500);
    const group = groups.find((g) => g.keikiChatId === chatId);
    return group ? await withMembers(ctx, group) : null;
  },
});

export const linkChatByCode = internalMutation({
  args: { chatId: v.string(), inviteCode: v.string() },
  handler: async (ctx, { chatId, inviteCode }) => {
    const group = await ctx.db
      .query("groups")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode.toUpperCase()))
      .unique();
    if (!group) return null;
    await ctx.db.patch("groups", group._id, { keikiChatId: chatId });
    return group.name;
  },
});
