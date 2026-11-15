import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const send = internalAction({
  args: {
    userIds: v.array(v.id("users")),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, { userIds, title, body, data }) => {
    if (userIds.length === 0) return null;
    const users = await ctx.runQuery(internal.users.getMany, { userIds });
    const messages = users
      .filter((u) => u.pushToken)
      .map((u) => ({ to: u.pushToken, title, body, data: data ?? {}, sound: "default" }));
    console.log(`push "${title}" -> ${messages.length}/${userIds.length} devices`);
    if (messages.length === 0) return null;
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) console.error("Expo push failed", res.status, await res.text());
    return null;
  },
});
