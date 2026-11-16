import { v } from "convex/values";
import { internalMutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

export const WEIGHTS = {
  swipeChosen: 1,
  swipeRejected: -0.5,
  vibe: 2,
  ratingPerStar: 0.75,
  ratingCategoryPerStar: 0.5,
  ratingVibe: 1,
  wouldRedo: 0.75,
  pass: -0.5,
  checkin: 0.5,
};
export const WEIGHT_LIMIT = 5;
export const DISLIKE_AT = -2;
export const RATING_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
export const RATING_VIBES = ["chill", "chaotic", "cozy", "thrilling", "fancy"];
const LEARNED_MIN_CHANGE = 0.25;
const LEARNED_MAX = 3;

// Tags for the onboarding this-or-that labels (data/thisOrThat.ts), in the places and experiences vocabulary.
export const SWIPE_TAGS: Record<string, string[]> = {
  "Boba run": ["boba", "quick", "social"],
  "Campus cafe": ["coffee", "cozy", "study-spot"],
  "$3 tacos": ["cheap-eats", "flavorful"],
  "Dumplings after lecture": ["cheap-eats", "quick"],
  "Escape room with the crew": ["group-friendly", "nerdy"],
  "Student-night bowling": ["group-friendly", "retro", "student-discount"],
  "Beach day off-campus": ["beach", "sunset"],
  "Hike behind campus": ["hiking", "active", "views"],
  "Free museum day": ["museum", "art", "free"],
  "Improv club show": ["free-shows", "lively"],
  "Dance till late": ["late-night", "lively", "music"],
  "Board games in the lounge": ["chill", "nerdy", "cozy"],
  "Birthday splurge dinner": ["splurge", "group-friendly"],
  "Cheap eats crawl": ["cheap-eats", "walking"],
  "Coffee shop crawl": ["coffee", "walking", "cozy"],
  "Smoothie after the gym": ["active", "quick"],
  "Climbing gym": ["climbing", "bouldering", "active"],
  "Mini golf": ["classic", "retro", "group-friendly"],
  "Your crew vs. theirs": ["social", "lively", "group-friendly"],
  "Quiet library corner": ["study-spot", "chill"],
  "Sunset from the campus hill": ["sunset", "views", "campus"],
  "Picnic on the quad": ["picnic", "campus", "chill"],
  "$5 student movie": ["film", "student-discount"],
  "Campus open mic": ["music", "campus", "free-shows"],
  "Dining hall brunch": ["campus", "cheap-eats"],
  "Late-night pizza": ["pizza", "late-night"],
  "Thrift store haul": ["thrift", "vintage", "browsing"],
  "Karaoke": ["karaoke", "lively", "music"],
  "Try a new spot": [],
  "Our usual campus spot": ["campus", "classic"],
};

export function normalizeTags(tags: string[]): string[] {
  const clean = tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0 && !/^[$_]/.test(t));
  return [...new Set(clean)];
}

export type TasteInput = {
  user: Pick<Doc<"users">, "vibes" | "diet" | "budgetMax">;
  swipes: { chosenTags: string[]; rejectedTags: string[] }[];
  ratings: { stars: number; tags: string[]; category?: string | null; vibe?: string; at?: number; planId?: Id<"plans"> }[];
  passes: { tags: string[] }[];
  checkins: { tags: string[]; category: string; at: number }[];
};

export function computeTaste({ user, swipes, ratings, passes, checkins }: TasteInput) {
  const raw: Record<string, number> = {};
  const add = (tags: string[], weight: number) => {
    for (const tag of normalizeTags(tags)) raw[tag] = (raw[tag] ?? 0) + weight;
  };
  for (const s of swipes) {
    add(s.chosenTags, WEIGHTS.swipeChosen);
    add(s.rejectedTags, WEIGHTS.swipeRejected);
  }
  add(user.vibes, WEIGHTS.vibe);
  const newestRatingAt = Math.max(0, ...ratings.map((r) => r.at ?? 0));
  for (const r of ratings) {
    const decay = 0.5 ** ((newestRatingAt - (r.at ?? newestRatingAt)) / RATING_HALF_LIFE_MS);
    const vibe = r.vibe?.trim().toLowerCase() ?? "";
    add(r.tags, ((r.stars - 3) * WEIGHTS.ratingPerStar + (vibe === "would-redo" ? WEIGHTS.wouldRedo : 0)) * decay);
    if (r.category) add([r.category], (r.stars - 3) * WEIGHTS.ratingCategoryPerStar * decay);
    if (RATING_VIBES.includes(vibe)) add([vibe], (r.stars >= 3 ? 1 : -1) * WEIGHTS.ratingVibe * decay);
  }
  for (const p of passes) add(p.tags, WEIGHTS.pass);
  const categoryCounts: Record<string, number> = {};
  const lastCategoryAt: Record<string, number> = {};
  for (const c of checkins) {
    add(c.tags, WEIGHTS.checkin);
    const [category] = normalizeTags([c.category]);
    if (!category) continue;
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    lastCategoryAt[category] = Math.max(lastCategoryAt[category] ?? 0, c.at);
  }
  const tagWeights: Record<string, number> = {};
  for (const [tag, weight] of Object.entries(raw)) {
    const clamped = Math.min(WEIGHT_LIMIT, Math.max(-WEIGHT_LIMIT, weight));
    const rounded = Math.round(clamped * 1000) / 1000;
    if (rounded !== 0) tagWeights[tag] = rounded;
  }
  return {
    tagWeights,
    dislikedTags: Object.keys(tagWeights).filter((tag) => tagWeights[tag] <= DISLIKE_AT).sort(),
    dietConstraints: normalizeTags(user.diet).sort(),
    categoryCounts,
    lastCategoryAt,
    budgetMax: user.budgetMax,
  };
}

export function learnedPhrases(before: Record<string, number>, after: Record<string, number>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .map((tag) => ({ tag, change: (after[tag] ?? 0) - (before[tag] ?? 0) }))
    .filter(({ change }) => Math.abs(change) >= LEARNED_MIN_CHANGE)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.tag.localeCompare(b.tag))
    .slice(0, LEARNED_MAX)
    .map(({ tag, change }) => {
      const label = tag.replace(/-/g, " ");
      if (RATING_VIBES.includes(tag)) return change > 0 ? `you love ${label} spots` : `fewer ${label} spots`;
      return change > 0 ? `more ${label}` : `less ${label}`;
    });
}

type PlanOption = Doc<"plans">["options"][number];

async function placeIdea(ctx: QueryCtx, placeId: Id<"places">) {
  const place = await ctx.db.get("places", placeId);
  return { tags: place?.tags ?? [], category: place?.category ?? null };
}

async function experienceTags(ctx: QueryCtx, experienceId: Id<"experiences">) {
  return (await ctx.db.get("experiences", experienceId))?.tags ?? [];
}

async function optionIdea(ctx: QueryCtx, option: PlanOption) {
  const place = await placeIdea(ctx, option.placeId);
  const tags = option.experienceId ? await experienceTags(ctx, option.experienceId) : [];
  return { tags: [...tags, ...place.tags], category: place.category };
}

async function passedTags(ctx: QueryCtx, plan: Doc<"plans">, userId: Id<"users">) {
  const keys = new Set(plan.rejectedOptionKeys ?? []);
  if (plan.rejectedBy?.includes(userId)) {
    for (const option of plan.options) keys.add(option.experienceId ?? option.placeId);
  }
  const passes: { tags: string[] }[] = [];
  for (const key of keys) {
    const experienceId = ctx.db.normalizeId("experiences", key);
    const placeId = ctx.db.normalizeId("places", key);
    if (experienceId) passes.push({ tags: await experienceTags(ctx, experienceId) });
    else if (placeId) passes.push({ tags: (await placeIdea(ctx, placeId)).tags });
  }
  return passes;
}

async function gatherInput(ctx: QueryCtx, user: Doc<"users">): Promise<TasteInput> {
  const swipes = await ctx.db
    .query("swipes")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(1000);
  const ratingRows = await ctx.db
    .query("ratings")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(1000);
  const ratings: TasteInput["ratings"] = [];
  for (const rating of ratingRows) {
    if (rating.planId) {
      const plan = await ctx.db.get("plans", rating.planId);
      const option = plan?.options[plan.winningIndex ?? 0];
      if (option) {
        const idea = await optionIdea(ctx, option);
        ratings.push({ stars: rating.stars, ...idea, vibe: rating.vibe, at: rating._creationTime, planId: rating.planId });
      }
    } else if (rating.questId) {
      const quest = await ctx.db.get("soloQuests", rating.questId);
      if (quest) {
        const idea = await placeIdea(ctx, quest.placeId);
        ratings.push({ stars: rating.stars, ...idea, vibe: rating.vibe, at: rating._creationTime });
      }
    }
  }
  const events = await ctx.db
    .query("pointEvents")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(2000);
  const passes: TasteInput["passes"] = [];
  const checkins: TasteInput["checkins"] = [];
  const passedPlans = new Set<Id<"plans">>();
  const checkedInPlans = new Set<Id<"plans">>();
  for (const event of events) {
    if (!event.planId) continue;
    if (event.reason === "reject_spend" && !passedPlans.has(event.planId)) {
      passedPlans.add(event.planId);
      const plan = await ctx.db.get("plans", event.planId);
      if (plan) passes.push(...(await passedTags(ctx, plan, user._id)));
    }
    if (event.reason === "checkin" && !checkedInPlans.has(event.planId)) {
      checkedInPlans.add(event.planId);
      const plan = await ctx.db.get("plans", event.planId);
      const option = plan && plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
      if (!option) continue;
      const idea = await optionIdea(ctx, option);
      checkins.push({ tags: idea.tags, category: idea.category ?? "", at: event._creationTime });
    }
  }
  return { user, swipes, ratings, passes, checkins };
}

// A rating-triggered rebuild (ratedPlanId set) records what the profile just learned in lastLearned;
// any other rebuild keeps the previous lastLearned.
export async function rebuildTaste(ctx: MutationCtx, userId: Id<"users">, ratedPlanId?: Id<"plans">) {
  const user = await ctx.db.get("users", userId);
  if (!user) return null;
  const input = await gatherInput(ctx, user);
  const taste = computeTaste(input);
  const existing = await ctx.db
    .query("tasteProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const now = Date.now();
  let lastLearned = existing?.lastLearned;
  if (ratedPlanId) {
    const before =
      existing?.tagWeights ??
      computeTaste({ ...input, ratings: input.ratings.filter((r) => r.planId !== ratedPlanId) }).tagWeights;
    lastLearned = { at: now, planId: ratedPlanId, learned: learnedPhrases(before, taste.tagWeights) };
  }
  const profile = { userId, ...taste, updatedAt: now, ...(lastLearned ? { lastLearned } : {}) };
  if (existing) {
    await ctx.db.replace("tasteProfiles", existing._id, profile);
    return existing._id;
  }
  return await ctx.db.insert("tasteProfiles", profile);
}

export const rebuild = internalMutation({
  args: { userId: v.id("users"), planId: v.optional(v.id("plans")) },
  handler: async (ctx, { userId, planId }) => {
    await rebuildTaste(ctx, userId, planId);
    return null;
  },
});

export const recordSwipe = internalMutation({
  args: { userId: v.id("users"), chosen: v.string(), rejected: v.string(), category: v.string() },
  handler: async (ctx, { userId, chosen, rejected, category }) => {
    if (!(await ctx.db.get("users", userId))) return null;
    await ctx.db.insert("swipes", {
      userId,
      chosen,
      rejected,
      category,
      chosenTags: SWIPE_TAGS[chosen] ?? [],
      rejectedTags: SWIPE_TAGS[rejected] ?? [],
      at: Date.now(),
    });
    await rebuildTaste(ctx, userId);
    return null;
  },
});

export const backfillAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(5000);
    for (const user of users) await ctx.scheduler.runAfter(0, internal.taste.rebuild, { userId: user._id });
    return users.length;
  },
});

export const getMyTaste = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("tasteProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) return null;
    return {
      tagWeights: profile.tagWeights,
      dislikedTags: profile.dislikedTags,
      dietConstraints: profile.dietConstraints,
      categoryCounts: profile.categoryCounts,
      lastCategoryAt: profile.lastCategoryAt,
      budgetMax: profile.budgetMax ?? null,
      updatedAt: profile.updatedAt,
    };
  },
});

export const getLastLearned = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({ at: v.number(), planId: v.optional(v.id("plans")), learned: v.array(v.string()) }),
  ),
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("tasteProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return profile?.lastLearned ?? null;
  },
});
