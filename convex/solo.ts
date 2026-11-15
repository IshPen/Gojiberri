import { v } from "convex/values";
import { internalAction, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { addDays, dayInPT } from "./context";
import { chatJSON } from "./llm";

const QUEST_SYSTEM_PROMPT = `You write a daily solo side quest for one person in San Francisco.
Given PLACE and MEMORIES about the person, write one playful, specific quest line of 12 words or fewer,
e.g. "Try the morning bun at Tartine and people-watch for ten minutes."
Return ONLY JSON: {"prompt":"..."}`;

function questLine(raw: unknown, place: Doc<"places">): string {
  const prompt = (raw as { prompt?: unknown })?.prompt;
  if (typeof prompt === "string" && prompt.trim() && prompt.trim().split(/\s+/).length <= 12) return prompt.trim();
  return `Go explore ${place.name} today.`;
}

export const getToday = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const quest = await ctx.db
      .query("soloQuests")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", dayInPT(Date.now())))
      .first();
    if (!quest) return null;
    const [place, sponsor, user] = await Promise.all([
      ctx.db.get("places", quest.placeId),
      quest.sponsorId ? ctx.db.get("sponsors", quest.sponsorId) : null,
      ctx.db.get("users", userId),
    ]);
    return { quest, place, sponsor, streak: user?.streak ?? 0 };
  },
});

export const pickSoloQuest = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<Id<"soloQuests"> | null> => {
    const date = dayInPT(Date.now());
    const data = await ctx.runQuery(internal.context.soloContext, { userId, date });
    if (!data || !data.user.onboarded) return null;
    if (data.existingQuestId) return data.existingQuestId;
    const { user } = data;

    const rated = new Set<string>(data.ratedPlaceIds);
    const candidates = (
      await ctx.runQuery(internal.places.listCandidates, { budgetMax: user.budgetMax, areas: [user.homeArea] })
    ).filter((p) => !rated.has(p._id));
    if (candidates.length === 0) return null;

    const memories: string[] = await ctx.runAction(api.memory.getMyProfile, { userId });
    const memoryText = memories.join(" ").toLowerCase();
    const vibes = new Set(user.vibes.map((t) => t.toLowerCase()));
    const score = (p: Doc<"places">) =>
      (p.area === user.homeArea ? 2 : 0) +
      p.tags.filter((t) => vibes.has(t.toLowerCase())).length +
      p.tags.filter((t) => memoryText.includes(t.toLowerCase())).length;

    const sponsor = await ctx.runQuery(internal.sponsors.pickSponsored, {
      budgetMax: user.budgetMax,
      tags: user.vibes,
    });
    const sponsoredPlace = sponsor ? candidates.find((p) => p._id === sponsor.placeId) : undefined;
    const ranked = [...candidates].sort((a, b) => score(b) - score(a));
    const place = sponsoredPlace ?? ranked[Math.floor(Math.random() * Math.min(3, ranked.length))];

    let prompt: string;
    try {
      prompt = questLine(
        await chatJSON(QUEST_SYSTEM_PROMPT, {
          PLACE: { name: place.name, area: place.area, category: place.category, tags: place.tags },
          MEMORIES: memories,
          SPONSOR_OFFER: sponsoredPlace ? sponsor!.offer : null,
        }),
        place,
      );
    } catch (err) {
      console.warn("Solo quest LLM failed, using fallback", err);
      prompt = questLine(null, place);
    }

    return await ctx.runMutation(internal.context.insertSoloQuest, {
      userId,
      date,
      placeId: place._id,
      prompt,
      ...(sponsoredPlace ? { sponsorId: sponsor!._id } : {}),
    });
  },
});

export const assignAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ assigned: number; users: number }> => {
    const userIds: Id<"users">[] = await ctx.runQuery(internal.context.listUserIds, {});
    let assigned = 0;
    for (const userId of userIds) {
      try {
        if (await ctx.runAction(internal.solo.pickSoloQuest, { userId })) assigned++;
      } catch (err) {
        console.error(`pickSoloQuest failed for ${userId}`, err);
      }
    }
    return { assigned, users: userIds.length };
  },
});

export const complete = mutation({
  args: { userId: v.id("users"), questId: v.id("soloQuests"), storageId: v.id("_storage") },
  handler: async (ctx, { userId, questId, storageId }) => {
    const [quest, user] = await Promise.all([ctx.db.get("soloQuests", questId), ctx.db.get("users", userId)]);
    if (!quest || quest.userId !== userId) throw new Error("Quest not found");
    if (!user) throw new Error("User not found");
    if (quest.status === "done") throw new Error("Quest already completed");

    const photoId = await ctx.db.insert("photos", { userId, questId, storageId });
    await ctx.db.patch("soloQuests", questId, { status: "done" });

    const streak = user.lastSoloDate === addDays(quest.date, -1) ? user.streak + 1 : 1;
    await ctx.db.patch("users", userId, { streak, lastSoloDate: quest.date });
    await ctx.runMutation(internal.points.award, { userId, reason: "solo" });

    if (quest.sponsorId) {
      const sponsor = await ctx.db.get("sponsors", quest.sponsorId);
      if (sponsor) {
        await ctx.db.insert("visits", { sponsorId: sponsor._id, userId, photoId, amount: sponsor.payPerVisit });
      }
    }
    return { photoId, streak };
  },
});
