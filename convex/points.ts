import { v } from "convex/values";
import { internalMutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { addDays, localDate, localTime, weekday } from "./time";

export const POINTS = { checkin: 50, confirm: 15, rate: 10 } as const;
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
) {
  const user = await ctx.db.get("users", userId);
  if (!user) throw new Error("User not found");
  const points = POINTS[reason];
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

async function topByLifetime(ctx: QueryCtx, limit: number) {
  const users = await ctx.db.query("users").take(1000);
  return users.sort((a, b) => lifetimeGojis(b) - lifetimeGojis(a)).slice(0, limit);
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

export const leaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const users = await topByLifetime(ctx, Math.min(limit ?? 20, 100));
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      points: lifetimeGojis(u),
      diamonds: u.diamonds,
      streak: u.streak,
    }));
  },
});

export const weeklyPrizes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const top = await topByLifetime(ctx, 3);
    for (const user of top) {
      await ctx.db.patch("users", user._id, { diamonds: user.diamonds + 1 });
    }
    if (top.length > 0) {
      await ctx.scheduler.runAfter(0, internal.notifications.send, {
        userIds: top.map((u) => u._id),
        title: "Weekly leaderboard prize",
        body: "You finished top 3 this week. +1 free reward!",
        data: { screen: "leaderboard" },
      });
    }
    return null;
  },
});

export function weekStartPT(now: number): number {
  const today = localDate(now);
  return localTime(addDays(today, -((weekday(today) + 6) % 7)), 0);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

async function weeklyStandings(ctx: QueryCtx) {
  const since = weekStartPT(Date.now());
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
