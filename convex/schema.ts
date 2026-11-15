import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const timeBlock = v.object({ start: v.number(), end: v.number() }); // ms epoch

export default defineSchema({
  users: defineTable({
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    budgetMax: v.number(),               // max $ per outing
    homeArea: v.string(),                // e.g. "Mission"
    diet: v.array(v.string()),           // e.g. ["vegetarian"]
    vibes: v.array(v.string()),          // e.g. ["cozy", "active"]
    onboarded: v.boolean(),
    points: v.number(),
    diamonds: v.number(),
    streak: v.number(),
    lastSoloDate: v.optional(v.string()), // "YYYY-MM-DD"
    pushToken: v.optional(v.string()),
    busyBlocks: v.array(timeBlock),      // uploaded from the phone calendar
  }).index("by_points", ["points"]),

  groups: defineTable({
    name: v.string(),
    inviteCode: v.string(),              // 6 chars, uppercase
    ownerId: v.id("users"),
    memberIds: v.array(v.id("users")),
    keikiChatId: v.optional(v.string()), // linked group chat
  }).index("by_inviteCode", ["inviteCode"]),

  places: defineTable({
    name: v.string(),
    area: v.string(),
    category: v.string(),                // "food" | "bar" | "activity" | "outdoors" | "arts"
    priceLevel: v.number(),              // 1-4
    tags: v.array(v.string()),           // ["cozy","rooftop","puzzle",...]
    lat: v.number(),
    lng: v.number(),
    durationMins: v.number(),
    bookingUrl: v.optional(v.string()),
  }).index("by_area", ["area"]),

  plans: defineTable({
    groupId: v.id("groups"),
    window: timeBlock,
    status: v.union(
      v.literal("generating"), v.literal("voting"), v.literal("locked"),
      v.literal("done"), v.literal("cancelled")
    ),
    options: v.array(v.object({
      placeId: v.id("places"),
      title: v.string(),
      costMin: v.number(),
      costMax: v.number(),
      why: v.string(),
      travel: v.optional(v.string()),    // "12 min by transit"
      experienceId: v.optional(v.id("experiences")), // [FUND]
      sponsorId: v.optional(v.id("sponsors")),
    })),
    winningIndex: v.optional(v.number()),
    confirmBy: v.number(),
    recurrenceId: v.optional(v.id("recurrences")),
  }).index("by_group", ["groupId"]),

  votes: defineTable({
    planId: v.id("plans"),
    userId: v.id("users"),
    optionIndex: v.number(),
    confirmed: v.boolean(),
  // eslint-disable-next-line @convex-dev/no-duplicate-indexes
  }).index("by_plan", ["planId"]).index("by_plan_user", ["planId", "userId"]),

  soloQuests: defineTable({
    userId: v.id("users"),
    date: v.string(),                    // "YYYY-MM-DD"
    placeId: v.id("places"),
    prompt: v.string(),                  // "Try the cardamom bun at Flour + Water Pizzeria"
    status: v.union(v.literal("open"), v.literal("done"), v.literal("skipped")),
    sponsorId: v.optional(v.id("sponsors")),
  }).index("by_user_date", ["userId", "date"]),

  ratings: defineTable({
    userId: v.id("users"),
    planId: v.optional(v.id("plans")),
    questId: v.optional(v.id("soloQuests")),
    stars: v.number(),                   // 1-5
    vibe: v.string(),                    // one word
  }).index("by_plan", ["planId"]).index("by_user", ["userId"]),

  photos: defineTable({
    userId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    planId: v.optional(v.id("plans")),
    questId: v.optional(v.id("soloQuests")),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
  }).index("by_group", ["groupId"]).index("by_plan", ["planId"]),

  sponsors: defineTable({
    business: v.string(),
    offer: v.string(),                   // "10% off any drink today"
    placeId: v.id("places"),
    priceLevel: v.number(),
    tags: v.array(v.string()),
    rewardCost: v.number(),              // diamonds to redeem the reward
    payPerVisit: v.number(),             // $ the business pays per verified visit
    active: v.boolean(),
  }),

  visits: defineTable({                  // verified by photo check-in
    sponsorId: v.id("sponsors"),
    userId: v.id("users"),
    photoId: v.id("photos"),
    amount: v.number(),
  }).index("by_sponsor", ["sponsorId"]),

  rewards: defineTable({
    sponsorId: v.id("sponsors"),
    userId: v.id("users"),
    code: v.string(),                    // Whop promo code
    redeemedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  deposits: defineTable({                // optional $5 flake deposit
    planId: v.id("plans"),
    userId: v.id("users"),
    whopPaymentId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("held"), v.literal("refunded"), v.literal("forfeited")),
  }).index("by_plan", ["planId"]),

  recurrences: defineTable({
    groupId: v.id("groups"),
    rule: v.string(),                    // "first-friday-monthly"
    nextRun: v.number(),
    active: v.boolean(),
  }).index("by_nextRun", ["nextRun"]),

  // [FUND] experiences that businesses sell
  experiences: defineTable({
    businessId: v.id("businesses"),
    title: v.string(),                   // "Private escape room for 4"
    description: v.string(),
    placeId: v.optional(v.id("places")),
    pricePerPerson: v.number(),          // $
    minGroup: v.number(),
    maxGroup: v.number(),
    tags: v.array(v.string()),
    imageUrl: v.optional(v.string()),
    whopProductId: v.optional(v.string()),
    whopPlanId: v.optional(v.string()),
    active: v.boolean(),
  }).index("by_business", ["businessId"]),

  // [FUND] local businesses
  businesses: defineTable({
    name: v.string(),
    whopAccountId: v.optional(v.string()),
    earned: v.number(),                  // $ total sales
  }),

  // [FUND] one pot per group
  pots: defineTable({
    groupId: v.id("groups"),
    balance: v.number(),                 // $ available
    monthlyContribution: v.number(),     // $ per member per month
    whopPlanId: v.optional(v.string()),
  }).index("by_group", ["groupId"]),

  // [FUND] ledger: every $ in and out of a pot
  transactions: defineTable({
    potId: v.id("pots"),
    type: v.union(v.literal("contribution"), v.literal("spend"), v.literal("refund")),
    amount: v.number(),
    userId: v.optional(v.id("users")),
    experienceId: v.optional(v.id("experiences")),
    planId: v.optional(v.id("plans")),
    whopPaymentId: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
    note: v.optional(v.string()),
  }).index("by_pot", ["potId"]),

  // [FUND] MOCK Whop group card until card issuing is verified
  cards: defineTable({
    groupId: v.id("groups"),
    last4: v.string(),
    status: v.union(v.literal("mock-active"), v.literal("active"), v.literal("frozen")),
    whopCardId: v.optional(v.string()),
  }).index("by_group", ["groupId"]),

  pointEvents: defineTable({             // audit log for points
    userId: v.id("users"),
    reason: v.union(v.literal("checkin"), v.literal("solo"), v.literal("confirm"), v.literal("rate")),
    points: v.number(),
    planId: v.optional(v.id("plans")),
    groupId: v.optional(v.id("groups")),
  }).index("by_user", ["userId"]),
});
