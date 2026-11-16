import { v } from "convex/values";
import { env, internalMutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { addDays, DAY, localDate, localTime, weekday } from "./time";
import { checkedInPlanIds, openPlanFor, quotedOrLive, userGroups } from "./novelty";

export const POINTS = {
  checkin: 50,
  confirm: 15,
  rate: 10,
  novel_bonus: 25,
  regular_bonus: 15,
  fullcrew_bonus: 20,
} as const;
export const STREAK_BONUS = 30;
const REGULAR_GAP = 14 * DAY;
const STREAK_LENGTH = 4;
const MAX_PREVIEW_IDEAS = 20;

export type AwardItem = { reason: keyof typeof POINTS; points: number; label: string };

// Consecutive checked-in crew outings ending at `start`, each within 14 days of the next.
// An earlier outing counts only if it was checked in before `planId`'s first check-in,
// so every member of a plan gets the same answer whatever order they check in.
export async function crewStreak(ctx: QueryCtx, group: Doc<"groups">, start: number, planId?: Id<"plans">) {
  const firstCheckin = new Map<Id<"plans">, number>();
  for (const memberId of group.memberIds) {
    const events = await ctx.db
      .query("pointEvents")
      .withIndex("by_user", (q) => q.eq("userId", memberId))
      .collect();
    for (const e of events) {
      if (e.reason !== "checkin" || !e.planId) continue;
      firstCheckin.set(e.planId, Math.min(firstCheckin.get(e.planId) ?? Infinity, e._creationTime));
    }
  }
  const cutoff = (planId && firstCheckin.get(planId)) || Infinity;
  const earlier = (
    await ctx.db
      .query("plans")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect()
  )
    .filter((p) => p._id !== planId && (firstCheckin.get(p._id) ?? Infinity) < cutoff && p.window.start < start)
    .sort((a, b) => b.window.start - a.window.start);
  let streak = 1;
  let previous = start;
  for (const outing of earlier) {
    if (previous - outing.window.start > REGULAR_GAP) break;
    streak += 1;
    previous = outing.window.start;
  }
  return streak;
}

export function checkinItems(novelPoints: number, streak: number): AwardItem[] {
  const items: AwardItem[] = [{ reason: "checkin", points: POINTS.checkin, label: "Check-in" }];
  if (novelPoints > 0) items.push({ reason: "novel_bonus", points: novelPoints, label: "Tried something new" });
  if (streak >= STREAK_LENGTH) {
    items.push({ reason: "regular_bonus", points: STREAK_BONUS, label: "4 outings in a row" });
  } else if (streak >= 2) {
    items.push({ reason: "regular_bonus", points: POINTS.regular_bonus, label: "Regular meetup" });
  }
  return items;
}

export const FULLCREW_ITEM: AwardItem = {
  reason: "fullcrew_bonus",
  points: POINTS.fullcrew_bonus,
  label: "Whole crew showed up",
};
export const POINTS_PER_DIAMOND = 500;
export const REJECT_COST = 10;

export function lifetimeGojis(user: Doc<"users">) {
  return user.points + (user.gojisSpent ?? 0);
}

const reasonValidator = v.union(
  v.literal("checkin"),
  v.literal("confirm"),
  v.literal("rate"),
);

export async function awardPoints(
  ctx: MutationCtx,
  userId: Id<"users">,
  reason: keyof typeof POINTS,
  source: { planId?: Id<"plans">; groupId?: Id<"groups"> } = {},
  points: number = POINTS[reason],
) {
  const user = await ctx.db.get("users", userId);
  if (!user) throw new Error("User not found");
  const total = user.points + points;
  const earned = lifetimeGojis(user);
  const newDiamonds =
    Math.floor((earned + points) / POINTS_PER_DIAMOND) - Math.floor(earned / POINTS_PER_DIAMOND);
  await ctx.db.patch("users", userId, { points: total, diamonds: user.diamonds + newDiamonds });
  await ctx.db.insert("pointEvents", { userId, reason, points, ...source });
  return { points: total, diamondsEarned: newDiamonds };
}

export async function spendGojis(
  ctx: MutationCtx,
  user: Doc<"users">,
  reason: "reject_spend",
  amount: number,
  source: { planId?: Id<"plans">; groupId?: Id<"groups"> } = {},
) {
  const balance = user.points - amount;
  await ctx.db.patch("users", user._id, { points: balance, gojisSpent: (user.gojisSpent ?? 0) + amount });
  await ctx.db.insert("pointEvents", { userId: user._id, reason, points: -amount, ...source });
  return balance;
}

export const award = internalMutation({
  args: {
    userId: v.id("users"),
    reason: reasonValidator,
    planId: v.optional(v.id("plans")),
    groupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, { userId, reason, planId, groupId }) => {
    return await awardPoints(ctx, userId, reason, { planId, groupId });
  },
});

export const gojiPreview = query({
  args: { userId: v.id("users"), ideaKeys: v.array(v.string()) },
  handler: async (ctx, { userId, ideaKeys }) => {
    const checkedIn = await checkedInPlanIds(ctx, userId);
    const groups = await userGroups(ctx, userId);
    const previews = [];
    for (const ideaKey of ideaKeys.slice(0, MAX_PREVIEW_IDEAS)) {
      const plan = await openPlanFor(ctx, userId, ideaKey, checkedIn);
      const novelty = await quotedOrLive(ctx, userId, ideaKey, plan);
      let streak = 1;
      for (const group of groups) {
        if (plan && group._id !== plan.groupId) continue;
        const crew = plan
          ? await crewStreak(ctx, group, plan.window.start, plan._id)
          : await crewStreak(ctx, group, Date.now());
        streak = Math.max(streak, crew);
      }
      const items = checkinItems(novelty.points, streak);
      previews.push({
        ideaKey,
        total: items.reduce((sum, item) => sum + item.points, 0),
        items: [...items, { ...FULLCREW_ITEM, conditional: true }],
        noveltyReason: novelty.reason,
        noveltySource: novelty.source,
        scored: novelty.source === "ai",
      });
    }
    return previews;
  },
});

const AWARD_LABELS: Record<string, string> = {
  checkin: "Check-in",
  novel_bonus: "Tried something new",
  regular_bonus: "Regular meetup",
  fullcrew_bonus: "Whole crew showed up",
  solo: "Solo quest",
  confirm: "Confirmed",
  rate: "Rated an outing",
};

export const myRecentAwards = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    const awards = [];
    for await (const e of ctx.db
      .query("pointEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")) {
      if (awards.length >= Math.min(Math.max(limit ?? 20, 1), 100)) break;
      if (e.points <= 0) continue;
      const streak = e.reason === "regular_bonus" && e.points === STREAK_BONUS;
      awards.push({
        reason: e.reason,
        points: e.points,
        label: streak ? "4 outings in a row" : (AWARD_LABELS[e.reason] ?? "Gojis"),
        planId: e.planId ?? null,
        createdAt: e._creationTime,
      });
    }
    return awards;
  },
});

export function weekStartPT(now: number): number {
  const today = localDate(now);
  return localTime(addDays(today, -((weekday(today) + 6) % 7)), 0);
}

export function leaderboardWeekStart(now: number): number {
  const override = env.LEADERBOARD_WEEK_START?.trim();
  if (override) {
    const ms = /^\d+$/.test(override) ? Number(override) : Date.parse(override);
    if (Number.isFinite(ms)) return ms;
  }
  return weekStartPT(now);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

async function weeklyStandings(ctx: QueryCtx) {
  const since = leaderboardWeekStart(Date.now());
  const [users, groups, events] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("groups").collect(),
    ctx.db
      .query("pointEvents")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
      .collect(),
  ]);

  const weekly = new Map<Id<"users">, number>();
  const crewPoints = new Map<Id<"groups">, Map<Id<"users">, number>>();
  for (const e of events) {
    if (e.reason !== "checkin") continue;
    weekly.set(e.userId, (weekly.get(e.userId) ?? 0) + e.points);
    if (!e.groupId) continue;
    const byUser = crewPoints.get(e.groupId) ?? new Map<Id<"users">, number>();
    byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + e.points);
    crewPoints.set(e.groupId, byUser);
  }
  const schoolOf = new Map(users.map((u) => [u._id, u.homeArea]));

  const crews = groups
    .map((g) => {
      const members = g.memberIds.filter((id) => schoolOf.has(id));
      const earned = crewPoints.get(g._id);
      const total = members.reduce((sum, id) => sum + (earned?.get(id) ?? 0), 0);
      const counts = new Map<string, number>();
      for (const id of members) {
        const school = schoolOf.get(id)!;
        counts.set(school, (counts.get(school) ?? 0) + 1);
      }
      let school = "";
      for (const [s, c] of counts) {
        if (c > (counts.get(school) ?? 0) || (c === counts.get(school) && s < school)) school = s;
      }
      return {
        groupId: g._id,
        name: g.name,
        school,
        rawAvg: members.length ? total / members.length : 0,
        memberCount: members.length,
      };
    })
    .filter((c) => c.memberCount > 0)
    .sort((a, b) => b.rawAvg - a.rawAvg || a.name.localeCompare(b.name));

  const bySchool = new Map<string, { total: number; userCount: number }>();
  for (const u of users) {
    if (!u.homeArea) continue;
    const entry = bySchool.get(u.homeArea) ?? { total: 0, userCount: 0 };
    entry.total += weekly.get(u._id) ?? 0;
    entry.userCount += 1;
    bySchool.set(u.homeArea, entry);
  }
  const schools = [...bySchool]
    .map(([school, { total, userCount }]) => ({ school, rawAvg: total / userCount, userCount }))
    .sort((a, b) => b.rawAvg - a.rawAvg || a.school.localeCompare(b.school));

  return { crews, schools };
}

export const groupLeaderboard = query({
  args: { school: v.optional(v.string()), limit: v.number() },
  handler: async (ctx, { school, limit }) => {
    const { crews } = await weeklyStandings(ctx);
    return crews
      .filter((c) => school === undefined || c.school === school)
      .slice(0, limit)
      .map(({ rawAvg, ...c }) => ({ ...c, avgPoints: round1(rawAvg) }));
  },
});

export const schoolLeaderboard = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const { schools } = await weeklyStandings(ctx);
    return schools.slice(0, limit).map(({ rawAvg, ...s }) => ({ ...s, avgPoints: round1(rawAvg) }));
  },
});

export const myRanks = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    const { crews, schools } = await weeklyStandings(ctx);
    const schoolIndex = schools.findIndex((s) => s.school === user.homeArea);
    const myGroupIds = new Set(
      (await ctx.db.query("groups").collect())
        .filter((g) => g.memberIds.includes(userId))
        .map((g) => g._id),
    );
    const crew = crews.find((c) => myGroupIds.has(c.groupId));
    const rivals = crew ? crews.filter((c) => c.school === crew.school) : [];
    return {
      crewRank: crew ? rivals.indexOf(crew) + 1 : null,
      crewName: crew?.name ?? null,
      crewAvg: crew ? round1(crew.rawAvg) : null,
      leaderName: rivals[0]?.name ?? null,
      leaderAvg: rivals[0] ? round1(rivals[0].rawAvg) : null,
      schoolRank: schoolIndex >= 0 ? schoolIndex + 1 : null,
      school: user.homeArea,
    };
  },
});
