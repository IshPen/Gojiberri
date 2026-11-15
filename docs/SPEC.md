# Sidequest — Technical Spec (paste into Capy / Claude)

Nov 15, 2026 · @Gauri Todur

> **Update 11:50: Whop pivot.** Sidequest is now **the shared fun fund for friend groups**. Members chip in each month through Whop, Sidequest suggests experiences that local businesses sell, and the group pays with one group card backed by the pot. The **Whop card is mocked**, because Whop doesn't verify card access on weekends. Businesses list and sell experiences through a portal. **Keiki and the $5 flake deposit are cut.** New pieces are marked **\[FUND\]**.

## How to use this doc

**Each agent task gets three pastes:** the context block below, the sections the task touches (usually the schema in section 4 and the matching part of the API contract in section 5), and one task prompt from section 8. Agents build the right thing when they can see the whole contract.

**Context block to paste at the top of every task:**

```markdown
You are working on Sidequest, a consumer mobile app built at a one-day hackathon.
Sidequest turns "we should hang out" into real plans: it suggests 3 outings a friend group
will like, fits them to everyone's free time and budget, runs a live vote, and learns from
ratings. There is also a daily solo quest, a photo drop / group story, points, and
sponsored quests from local businesses.

Stack: Expo (React Native, TypeScript, Expo Router) + Convex (database, functions,
realtime, file storage, scheduler, crons). AI calls (Supermemory, OpenAI), Whop and
Keiki are ONLY called from Convex actions, never from the phone.

Rules:
- TypeScript everywhere. Use Convex validators (v) for every function's args.
- Do not edit convex/schema.ts unless the task says so. Use the schema as given.
- Only create or edit the files named in the task.
- Function names, args, and return shapes must match the API contract exactly.
- Identify the user with a userId arg (simple hackathon auth, stored on the device).
- Keep it simple and demo-ready: clear loading and empty states, no over-engineering.
- When done, summarize what you built and anything the teammate needs to wire up.
```

## Stack, conventions and environment variables

**The phone only talks to Convex. Convex actions make every outside call, so API keys never leave the server and every phone sees the same live state.**

| Layer | Tech | Notes |
| --- | --- | --- |
| App | Expo SDK (latest), Expo Router, TypeScript | Runs in Expo Go on real phones |
| State / data | `convex/react` (`useQuery`, `useMutation`, `useAction`) | No Redux or other state library. Convex queries update live on their own |
| Backend | Convex: queries, mutations, actions, internal functions, scheduler, crons, file storage, HTTP actions | Every file in `convex/` |
| Memory | `supermemory` npm SDK | Container tags `user_<userId>` and `group_<groupId>` |
| LLM | `openai` npm SDK (any fast model) | JSON output only |
| Calendar | `expo-calendar` | Read busy blocks on the device, create the invite when the plan locks |
| Camera | `expo-camera` or `expo-image-picker` | Upload to Convex storage |
| Notifications | `expo-notifications` + Expo push API from a Convex action | Every timed push also gets a "send now" demo button |
| Device storage | `@react-native-async-storage/async-storage` | Holds `userId` |
| Payments | Whop API (sandbox) | Sponsor checkout, $5 flake deposit, reward promo codes |
| Group-chat agent | Keiki | Inbound and outbound messages through `convex/http.ts` |
| Testing | Revyl | 3 natural-language E2E tests on iOS and Android |

**Conventions**

- Files in `convex/` are named by domain (`plans.ts`, `votes.ts`). Functions are camelCase verbs (`castVote`).
- Use `internalMutation`, `internalQuery` and `internalAction` for anything the phone shouldn't call directly.
- Any action that uses npm packages starts with `"use node";`. Those files can only contain actions.
- Times are stored as `number` (ms since epoch). Days are stored as `"YYYY-MM-DD"` strings.
- Money is whole dollars (`number`). Price level is 1-4 and maps to $0-15, $15-35, $35-70, $70+.
- Screens are in `app/`, reusable UI in `components/`, device helpers in `lib/`.

**Environment variables.** Set these in Convex with `npx convex env set NAME value`. Every teammate's dev deployment needs them.

| Variable | Used by | Owner |
| --- | --- | --- |
| `SUPERMEMORY_API_KEY` | `convex/memory.ts`, `convex/suggest.ts` | Gauri |
| `OPENAI_API_KEY` | `convex/suggest.ts`, `convex/solo.ts`, `convex/keiki.ts` | Gauri |
| `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET` | `convex/whop.ts`, `convex/http.ts` | Gauri |
| `KEIKI_API_KEY` | `convex/keiki.ts` | Gauri |
| `GOOGLE_PLACES_API_KEY` (optional) | `convex/places.ts` | Gauri |
| `EXPO_PUBLIC_CONVEX_URL` | The app (written to `.env.local` by `npx convex dev`) | Automatic |

## Folder and file structure

**Every file has one owner. Only that owner, or an agent the owner started, edits it.** Owners: U = Uma (app/UI), I = Ishan (backend), G = Gauri (AI/data/sponsors).

```text
sidequest/
├─ app/                              # Expo Router screens (U)
│  ├─ _layout.tsx                    # ConvexProvider, fonts, theme, auth gate
│  ├─ index.tsx                      # redirect: onboarding or (tabs)/home
│  ├─ onboarding/
│  │  ├─ name.tsx                    # name + avatar -> users.createUser
│  │  ├─ swipe.tsx                   # this-or-that cards -> memory.rememberSwipe
│  │  └─ preferences.tsx             # budget, home area, diet, vibes
│  ├─ (tabs)/
│  │  ├─ _layout.tsx                 # tab bar: Home, Groups, Leaderboard, Profile
│  │  ├─ home.tsx                    # today's solo quest, upcoming plans, sponsored card
│  │  ├─ groups.tsx                  # my groups + create/join
│  │  ├─ leaderboard.tsx             # global leaderboard (live)
│  │  └─ profile.tsx                 # points, diamonds, rewards, "what Sidequest knows"
│  ├─ group/
│  │  ├─ new.tsx                     # create group -> invite code
│  │  ├─ join.tsx                    # enter invite code
│  │  └─ [groupId].tsx               # group home: Plan button, plans, story link
│  ├─ plan/[planId].tsx              # 3 options, live votes, lock, confirm, deposit
│  ├─ rate/[targetId].tsx            # 1-5 stars + one-word vibe
│  ├─ story/[groupId].tsx            # group photo story (live)
│  ├─ camera.tsx                     # photo check-in (plan or solo quest)
│  ├─ sponsor/[sponsorId].tsx        # sponsor offer + redeem reward
│  └─ sponsor-dashboard.tsx          # demo: verified visits + $ earned
├─ components/                       # (U)
│  ├─ SwipeCard.tsx  OptionCard.tsx  VoteBar.tsx  QuestCard.tsx
│  ├─ SponsoredBadge.tsx  PhotoGrid.tsx  StarRating.tsx  PointsPill.tsx
├─ lib/                              # (U)
│  ├─ session.ts                     # get/set userId in AsyncStorage
│  ├─ calendar.ts                    # readBusyBlocks(), createInvite(plan)
│  ├─ notifications.ts               # register push token -> users.setPushToken
│  └─ format.ts                      # dates, $ ranges
├─ constants/theme.ts                # colors, spacing, fonts (U)
├─ data/thisOrThat.ts                # 15 this-or-that pairs (G)
├─ convex/
│  ├─ schema.ts                      # (I) ONLY Ishan edits
│  ├─ users.ts  groups.ts  plans.ts  votes.ts  availability.ts   # (I)
│  ├─ ratings.ts  reminders.ts  points.ts  photos.ts  recurrences.ts  # (I)
│  ├─ crons.ts  http.ts  notifications.ts  demo.ts   # (I)
│  ├─ suggest.ts                     # (G) generateSuggestions
│  ├─ memory.ts                      # (G) Supermemory read/write
│  ├─ pricing.ts                     # (G) price level -> $ range, budget filter
│  ├─ places.ts                      # (G) places queries (+ optional live API)
│  ├─ solo.ts                        # (G) pickSoloQuest, today's quest
│  ├─ sponsors.ts                    # (G) slotting, rewards, stats
│  ├─ whop.ts                        # (G) checkout, deposit, refund
│  ├─ keiki.ts                       # (G) group-chat agent
│  └─ seed.ts                        # (G) demo data
├─ .env.local                        # written by convex dev (never commit keys)
└─ app.json  package.json  tsconfig.json
```

## Convex schema

**This is `convex/schema.ts` in full.** Ishan commits it first. Everyone else pastes it into their agent tasks and never edits it.

```typescript
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
  }).index("by_user", ["userId"]),
});
```

**Points rules:** check-in +50, solo quest +25, confirm before the deadline +15, rating +10. Every 500 points converts to 1 diamond.

## Backend API contract

**The app and every agent call these functions by exactly these names.** Types: Q = query, M = mutation, A = action, iM / iQ / iA = internal, which only other Convex functions can call.

| File | Function | Type | Args | Returns / does | Owner |
| --- | --- | --- | --- | --- | --- |
| users.ts | `createUser` | M | name | userId, with points, diamonds and streak set to 0 and onboarded false | I |
| users.ts | `getUser` | Q | userId | user doc | I |
| users.ts | `updatePreferences` | M | userId, budgetMax, homeArea, diet\[\], vibes\[\] | Sets onboarded true, schedules `memory.rememberPreferences` | I |
| users.ts | `setBusyBlocks` | M | userId, blocks\[{start,end}\] | Replaces busyBlocks | I |
| users.ts | `setPushToken` | M | userId, token |  | I |
| groups.ts | `createGroup` | M | userId, name | {groupId, inviteCode} | I |
| groups.ts | `joinGroup` | M | userId, inviteCode | groupId, or an error if the code is wrong | I |
| groups.ts | `getMyGroups` | Q | userId | groups\[\] with member names | I |
| groups.ts | `getGroup` | Q | groupId | group + members\[\] (name, avatar) | I |
| availability.ts | `findFreeWindows` | Q | groupId, from, to, minHours | Up to 3 windows \[{start,end}\] that are free for everyone, 10am-10pm only | I |
| plans.ts | `createPlan` | M | userId, groupId, window | planId with status "generating", schedules `suggest.generateSuggestions` | I |
| plans.ts | `saveOptions` | iM | planId, options\[\] | Sets options and status "voting", confirmBy = now + 24h (demo: + 5 min) | I |
| plans.ts | `getPlan` | Q | planId | plan + votes + per-option counts + places | I |
| plans.ts | `getGroupPlans` | Q | groupId | plans\[\], newest first | I |
| votes.ts | `castVote` | M | userId, planId, optionIndex | Upserts the vote. A majority on one option locks it: winningIndex, status "locked", schedules reminders | I |
| votes.ts | `confirmAttendance` | M | userId, planId | confirmed true, +15 points if before confirmBy | I |
| reminders.ts | `scheduleForPlan` | iM | planId | Schedules reminders at -24h and -2h, the drop at confirmBy, the rating prompt the next morning at 9am | I |
| reminders.ts | `dropUnconfirmed` / `sendReminder` / `sendRatingPrompt` | iM / iA | planId | Push via `notifications.send` | I |
| notifications.ts | `send` | iA | userIds\[\], title, body, data | POST to the Expo push API | I |
| ratings.ts | `submitRating` | M | userId, planId? or questId?, stars, vibe | Inserts, +10 points, schedules `memory.rememberRating` | I |
| photos.ts | `generateUploadUrl` | M |  | Upload URL | I |
| photos.ts | `savePhoto` | M | userId, storageId, groupId?, planId?, questId?, caption? | photoId, +50 points, records a sponsor visit if the place is sponsored | I |
| photos.ts | `getGroupStory` | Q | groupId | photos\[\] with URL, user name, plan title, newest first | I |
| points.ts | `award` | iM | userId, reason | Adds points, logs a pointEvent, converts 500 points to 1 diamond | I |
| points.ts | `leaderboard` | Q | limit | Top users by points | I |
| recurrences.ts | `setRecurrence` / `runDue` | M / iM | groupId, rule | runDue creates the next plan one week ahead | I |
| crons.ts |  |  |  | Daily 8am PT: `solo.assignAll`. Hourly: `recurrences.runDue`. Weekly Mon: leaderboard prizes | I |
| demo.ts | `sendRatingNow`, `sendReminderNow`, `assignSoloNow`, `resetDemo` | M | planId / userId | Demo triggers | I |
| http.ts | `/whop/webhook`, `/keiki/webhook` | HTTP |  | Verify the request, then route to `whop.handleEvent` / `keiki.handleMessage` | I |
| suggest.ts | `generateSuggestions` | iA | planId | Loads the group, budgets, places and memories, asks the LLM for 3 picks, then `plans.saveOptions` | G |
| memory.ts | `rememberSwipe` | A | userId, chosen, rejected, category | Writes to `user_<id>` | G |
| memory.ts | `rememberPreferences` | iA | userId | Writes budget, diet, vibes, area | G |
| memory.ts | `rememberRating` | iA | ratingId | Writes stars, vibe and place to `user_<id>` and `group_<id>` | G |
| memory.ts | `getGroupContext` | iA | groupId | {groupSummary, members:\[{name, memories\[\]}\]} | G |
| memory.ts | `getMyProfile` | A | userId | Short "what Sidequest knows about you" list | G |
| pricing.ts | `priceRange`, `fitsBudget` | helpers | level / level, budget | {min,max} / boolean | G |
| places.ts | `listCandidates` | iQ | budgetMax, areas\[\] | Places that fit the budget | G |
| solo.ts | `pickSoloQuest` | iA | userId | Inserts today's soloQuest (LLM-written prompt) | G |
| solo.ts | `assignAll` | iA |  | Runs `pickSoloQuest` for every user | G |
| solo.ts | `getToday` | Q | userId | Today's quest + place | G |
| solo.ts | `complete` | M | userId, questId, storageId | status "done", photo saved, +25 points, streak updated | G |
| sponsors.ts | `listActive` | Q |  | Active sponsors | G |
| sponsors.ts | `pickSponsored` | iQ | budgetMax, tags\[\] | The best-fitting sponsor or null | G |
| sponsors.ts | `redeemReward` | M | userId, sponsorId | Spends diamonds, returns a promo code | G |
| sponsors.ts | `stats` | Q | sponsorId | {visits, earned} for the dashboard | G |
| whop.ts | `createSponsorCheckout` | A | sponsorId | Whop checkout URL | G |
| whop.ts | `createDeposit` | A | userId, planId | Checkout URL for the $5 hold | G |
| whop.ts | `handleEvent` / `refundDeposit` | iA | event / depositId | Updates deposits, refunds after check-in | G |
| keiki.ts | `handleMessage` | iA | chatId, sender, text | Parses "plan…", "vote 2" and "status", calls the plan and vote functions, replies | G |
| keiki.ts | `sendMessage` | iA | chatId, text | POST to the Keiki API | G |
| seed.ts | `seedDemo` | M |  | 30 SF places, 3 users, 1 group, 4 past plans with ratings, 3 sponsors | G |

### &#91;FUND\] Additions to the contract

| File | Function | Type | Args | Returns / does | Owner |
| --- | --- | --- | --- | --- | --- |
| funds.ts | `createPot` | M | groupId, monthlyContribution | potId. Also runs `cards.issueCard` | I |
| funds.ts | `getPot` | Q | groupId | {balance, monthlyContribution, paidThisMonth\[userIds\], transactions\[\] newest first} | I |
| funds.ts | `recordContribution` | iM | potId, userId, amount, whopPaymentId | A completed contribution. balance += amount | I |
| funds.ts | `spend` | iM | potId, amount, experienceId, planId | Throws if balance < amount. Adds a spend transaction, balance -= amount, business.earned += amount | I |
| experiences.ts | `listExperiences` | Q | maxPerPerson?, tags? | Active experiences, cheapest first | I |
| experiences.ts | `getExperience` | Q | experienceId | Experience + business name | I |
| experiences.ts | `createExperience` | M | businessId, title, description, pricePerPerson, minGroup, maxGroup, tags | experienceId. Schedules `whop.createExperienceProduct` | I |
| businesses.ts | `businessStats` | Q | businessId | {bookings, earned, recentSales\[\]} | I |
| whop.ts | `createContributionCheckout` | A | userId, groupId, amount | Whop checkout URL with metadata {potId, userId} | G |
| whop.ts | `createExperienceProduct` | iA | experienceId | Creates a Whop product and plan, saves their ids | G |
| whop.ts | `transferToBusiness` | iA | transactionId | Whop transfer to the business account. If the sandbox refuses, keep the ledger entry and note "ledger-only" | G |
| whop.ts | `handleEvent` | iA | event | A successful payment with metadata calls `funds.recordContribution` | G |
| cards.ts | `issueCard` | iM | groupId | **MOCK:** random last4, status "mock-active" | G |
| cards.ts | `getCard` | Q | groupId | Card + limit (= pot balance) | G |
| cards.ts | `chargeCard` | M | userId, groupId, planId | **MOCK:** amount = experience price × confirmed members. Runs `funds.spend`, then schedules `whop.transferToBusiness`. Later, only the internals change for the real card API | G |

`generateSuggestions` now picks from **experiences** first. It keeps only those where price × member count ≤ pot balance, plus 1 free or cheap place as a backup.

## Screens and navigation

**Flow:** first launch → onboarding (name → swipes → preferences) → tabs. Home is the daily hook, and a group's page is where plans start. Every screen reads live data with `useQuery`, so votes, photos and points update without a refresh.

| Screen | Route | Shows | Calls |
| --- | --- | --- | --- |
| Name | `/onboarding/name` | Name field, avatar emoji picker | `users.createUser`, then `lib/session.setUserId` |
| Swipe | `/onboarding/swipe` | 10-15 this-or-that cards (2 images, tap or swipe one), progress bar | `memory.rememberSwipe` on each card (fire and forget) |
| Preferences | `/onboarding/preferences` | Budget slider ($10-$100), home area picker, diet chips, vibe chips, "Connect calendar" | `users.updatePreferences`, `lib/calendar.readBusyBlocks` → `users.setBusyBlocks`, `lib/notifications` register |
| Home | `/(tabs)/home` | Today's solo quest card (photo check-in button, streak), upcoming locked plans, 1 sponsored card | `solo.getToday`, `plans.getGroupPlans`, `sponsors.listActive` |
| Groups | `/(tabs)/groups` | My groups, Create, Join | `groups.getMyGroups` |
| New group | `/group/new` | Name field, shows the invite code to share | `groups.createGroup` |
| Join group | `/group/join` | 6-character code field | `groups.joinGroup` |
| Group home | `/group/[groupId]` | Members, the free windows found, a **Plan an outing** button, past and upcoming plans, story link | `availability.findFreeWindows`, `plans.createPlan`, `plans.getGroupPlans` |
| Plan / vote | `/plan/[planId]` | "Generating…" skeleton, then 3 OptionCards (title, $ range per person, why, travel, Sponsored badge). Live vote bars, a lock banner, Confirm, the optional $5 deposit, booking link | `plans.getPlan`, `votes.castVote`, `votes.confirmAttendance`, `whop.createDeposit`. On lock: `lib/calendar.createInvite` |
| Rate | `/rate/[targetId]` | 1-5 stars + a one-word vibe chip or text | `ratings.submitRating` |
| Camera | `/camera?planId=` or `?questId=` | Take a photo, add a caption, upload | `photos.generateUploadUrl`, `photos.savePhoto` / `solo.complete` |
| Story | `/story/[groupId]` | Photo grid or reel, newest first, grouped by plan | `photos.getGroupStory` |
| Leaderboard | `/(tabs)/leaderboard` | Top 20 by points, my rank highlighted | `points.leaderboard` |
| Profile | `/(tabs)/profile` | Points, diamonds, streak, rewards, "What Sidequest knows about you" | `users.getUser`, `memory.getMyProfile` |
| Sponsor | `/sponsor/[sponsorId]` | The offer, diamond cost, Redeem, then the promo code | `sponsors.redeemReward` |
| Sponsor dashboard | `/sponsor-dashboard` | Demo: verified visits, $ earned, a "Fund more quests" Whop checkout | `sponsors.stats`, `whop.createSponsorCheckout` |

### &#91;FUND\] New screens

| Screen | Route | Shows | Calls |
| --- | --- | --- | --- |
| Group Fund | `/fund/[groupId]` | Big pot balance, monthly amount, who has chipped in this month, a **Chip in** button, the transaction list | `funds.getPot`, `whop.createContributionCheckout` (opened with `expo-web-browser`) |
| Group Card | `/card/[groupId]` | Card visual (group name, •••• last4, small "demo card" label), limit = pot, **Tap to pay** for the locked plan, receipt | `cards.getCard`, `cards.chargeCard` |
| Explore | `/(tabs)/explore` | Experiences from local businesses, filterable by price per person | `experiences.listExperiences` |
| Experience detail | `/experience/[experienceId]` | Photo, price per person, group size, business, "Suggest to my group" | `experiences.getExperience` |
| Business portal | `/business` | "List an experience" form, my listings, bookings and earnings | `experiences.createExperience`, `businesses.businessStats` |

Also, the group home shows the pot balance and links to the Fund and Card screens. Option cards show the total from the pot ("$48 from your $60 pot"). A locked plan shows **Pay with group card**.

**Look and feel:** one accent color, big rounded cards, large tap targets, haptics on vote and lock (`expo-haptics`), and confetti when a plan locks (`react-native-confetti-cannon`).

## Feature specs and integrations

**Features 1-5 are the demo core and must be real. Features 6-11 can be thin.**

### 1. Suggestions that learn (`convex/suggest.ts`)

`generateSuggestions(planId)` runs these steps in order:

1. Load the group, its members and each member's `budgetMax`, `diet` and `homeArea`. The budget cap is the lowest `budgetMax` in the group.
2. Get candidates with `places.listCandidates`: places whose price level fits the cap (`pricing.fitsBudget`). Exclude places the group has rated 2 stars or lower.
3. `memory.getGroupContext(groupId)` returns the group summary plus the top 5 memories per member.
4. `sponsors.pickSponsored` returns at most one sponsor that fits the budget and shares 2 or more tags with the group's vibes.
5. Call the LLM with the prompt below and parse its JSON. If the call fails or the JSON is invalid, fall back to the top 3 candidates by tag overlap, with the reason "Matches your crew's vibe."
6. Pass the result to `plans.saveOptions`.

LLM prompt (system message):

```text
You plan outings for a friend group. Pick exactly 3 places from CANDIDATES that this
group will love, that fit EVERY member's budget and diet, and that suit the time WINDOW.
Use MEMORIES to personalize. Each "why" is one sentence (max 18 words) that cites a
specific memory, e.g. "You rated the escape room 5 stars, so here's a puzzle bar."
If SPONSOR is provided and fits, you may use it as one of the 3.
Return ONLY JSON: {"options":[{"placeId":"...","title":"...","why":"..."}]}
```

The user message carries WINDOW, BUDGET\_CAP, DIETS, CANDIDATES (id, name, area, category, price level, tags), MEMORIES and SPONSOR as JSON. The cost fields `costMin` and `costMax` come from `pricing.priceRange`, not from the LLM.

### 2. Supermemory taste model (`convex/memory.ts`)

- **Container tags:** `user_<userId>` per person and `group_<groupId>` per group.
- **Write each memory as a short natural sentence:**
  - "Prefers rooftop bar over cozy cafe."
  - "Rated Escape SF 5 stars, vibe: thrilling."
  - "Budget max $25, vegetarian, lives in Mission."
- **Read:** search each member's tag for "outing preferences" (top 5), and get the group tag's memories or profile for the group summary.
- **Timing:** memories are processed in the background. For the demo, seed them early, and wait or poll a few seconds after a write before reading it back.

### 3. Calendar and free windows (`lib/calendar.ts`, `convex/availability.ts`)

- On the phone, request calendar permission, read events for the next 14 days, and upload only start/end busy blocks (`users.setBusyBlocks`).
- `findFreeWindows`: merge every member's busy blocks, scan 10am-10pm per day in 30-minute steps, and return the first 3 windows of `minHours` or more that are free for everyone.
- When a plan locks, each phone creates a calendar event with the title, place, time and booking link in the notes.
- **Fallback:** if permission is denied, seed busy blocks for the demo users.

### 4. Live vote and lock (`convex/votes.ts`)

- A majority is `floor(members / 2) + 1` votes on one option. Lock when it's reached, or at `confirmBy` lock the option with the most votes.
- Locking sets the status, schedules `reminders.scheduleForPlan`, and fires confetti in the app (the app sees `status` change live).

### 5. Solo quest (`convex/solo.ts`)

Every morning, pick one place per user in or near their `homeArea` that fits their budget, isn't yet rated, and matches their memories. The LLM writes a quest line of 12 words or fewer. Completing it means a photo check-in, +25 points and a streak update (+1 if yesterday was done, otherwise reset to 1).

### 6. Reminders and deadlines (`convex/reminders.ts`)

- Pushes go out 24 hours and 2 hours before the outing.
- At `confirmBy`, unconfirmed people are dropped and notified.
- The rating prompt goes out at 9am the next day.
- **Demo:** set `confirmBy` to now + 5 minutes, and use the `demo.ts` triggers.

### 7. Transportation (thin)

Estimate travel from the home-area center to the place: straight-line km / 15 km/h = transit minutes. Show "\~12 min by transit". Add a ride-share deep link: `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=..&dropoff[longitude]=..`.

### 8. Photo drop and group story

Upload with `generateUploadUrl`, POST the file, then call `savePhoto`. `getGroupStory` returns signed URLs via `ctx.storage.getUrl`.

### 9-10. Points, diamonds, leaderboard and sponsors

- Points come from `points.award` only. 500 points converts to 1 diamond.
- **Sponsored slotting rule:** at most 1 sponsored option per plan and 1 sponsored solo quest per day. It must fit the budget and share 2 or more tags with the group, and it's always labeled "Sponsored."
- A photo check-in at a sponsored place inserts a `visit` with amount = `payPerVisit`.

### 11. Monthly recurrence (thin)

The only rule is `first-friday-monthly`. `runDue` creates the next plan with a window of 6-10pm on the next first Friday, opens voting 7 days ahead, and sets `nextRun` to the following month.

### &#91;FUND\] Group fund, experiences and card (this replaces the Whop and Keiki specs below)

**Money flow:** members chip in through Whop checkout. The webhook adds each payment to the pot. The group votes on an experience and taps **Pay with group card**. The pot pays the business, and the business portal shows the sale.

1. **Create a pot.** When a group is created, `funds.createPot` runs with $20 per member per month and issues the mock card.
2. **Chip in.** `whop.createContributionCheckout` creates a Whop sandbox checkout for $20, with metadata `{potId, userId}`. The app opens it with `expo-web-browser`. The Whop webhook goes to `/whop/webhook` (Convex HTTP), then `whop.handleEvent`, then `funds.recordContribution`. The pot balance updates live on every phone.
   - **Demo fallback:** a "Simulate payment" button in `demo.ts` calls `recordContribution` directly, in case the webhook is slow.
3. **Suggest.** Experiences are filtered so that price × members ≤ pot balance, then ranked with memories as before. The "why" line can mention the pot: "Fits your $60 pot with $12 to spare."
4. **Vote and lock.** Unchanged.
5. **Pay.** On the Card screen, **Tap to pay** calls `cards.chargeCard`, which runs `funds.spend` and then `whop.transferToBusiness`. The receipt shows the business, the amount and the new balance.
6. **Business side.** A business lists an experience in `/business`. `createExperience` then calls `whop.createExperienceProduct`, which creates a Whop product and plan. `businessStats` shows bookings and earnings.

**The card is a mock, but everything around it is real.** `cards.ts` has the same function shape a real Whop card integration would have (issue, get, charge). Only the inside of `issueCard` and `chargeCard` changes once Whop verifies card access. The UI labels it a demo card.

**Seed data:** 3 businesses with 6–8 experiences (escape room for 4 at $28 per person, pottery night at $35, karaoke room at $15, sunset kayak at $40, a food tour at $25). The demo group starts with a $0 pot so it can be funded live on stage.

### Whop (`convex/whop.ts`)

- Use the **sandbox** API (`https://sandbox-api.whop.com/api/v1`) with a Bearer `WHOP_API_KEY`, called from actions only.
- **Sponsor checkout:** create a checkout configuration for a "Sponsored quest pack" plan, return its URL, and open it with `expo-web-browser`.
- **Flake deposit:** a $5 checkout per person. The webhook marks the deposit "held." After the photo check-in, refund it and mark it "refunded." If the person is dropped at the deadline, mark it "forfeited."
- **Rewards:** `redeemReward` returns a promo code. Pre-create them in the Whop dashboard if the API is slow, and store them in seed data.
- **Webhook:** `convex/http.ts` route `/whop/webhook`, verified with `WHOP_WEBHOOK_SECRET`. The Convex deployment URL is public, so no tunnel is needed.

### Keiki group-chat agent (`convex/keiki.ts`)

- **Confirm the API with the Keiki team first.** This assumes they send each inbound message to our webhook and we reply through their API.
- **Commands:**
  - "plan \[day\]" creates a plan for the linked group and replies with 3 numbered options plus reasons.
  - "vote N" calls `castVote`.
  - "status" replies with the vote counts.
  - Free text is answered by the LLM in a friendly planner voice.
- **Linking:** the first message in a chat containing an invite code sets `groups.keikiChatId`.
- When a plan locks, the agent posts "Locked! \[title\] Sat 2pm. Confirm in the app: \[deep link\]."

## Ready-to-paste task prompts

**Paste in this order: the context block (section 1), the schema (section 4), the matching rows of the API contract (section 5), then one prompt below.** Run tasks with no shared files at the same time. Whoever started a task reviews its PR.

### Ishan (backend)

- [ ] **I-1 Foundation (do yourself, 10:00):** "Set up Convex in this Expo app. Create convex/schema.ts exactly as given. Create convex/users.ts and convex/groups.ts with every function in the contract. Invite codes are 6 uppercase characters, unique."
- [ ] **I-2 Plans and votes:** "Create convex/plans.ts and convex/votes.ts per the contract. createPlan schedules internal.suggest.generateSuggestions with ctx.scheduler.runAfter(0, ...). castVote upserts by the by\_plan\_user index and locks the plan on a majority (floor(members/2)+1). On lock, schedule internal.reminders.scheduleForPlan. Only edit those two files."
- [ ] **I-3 Availability:** "Create convex/availability.ts with findFreeWindows(groupId, from, to, minHours). Merge all members' busyBlocks, scan 10:00-22:00 each day in 30-minute steps, and return the first 3 windows of at least minHours that are free for everyone."
- [ ] **I-4 Scheduler:** "Create convex/reminders.ts, convex/notifications.ts (Expo push API via fetch in an action), convex/crons.ts (daily 15:00 UTC: internal.solo.assignAll; hourly: internal.recurrences.runDue) and convex/demo.ts (sendRatingNow, sendReminderNow, assignSoloNow, resetDemo)."
- [ ] **I-5 Points and photos:** "Create convex/points.ts (award, leaderboard), convex/ratings.ts and convex/photos.ts per the contract. savePhoto awards 50 points, and if the plan's winning option or the quest has a sponsorId, it inserts a visit with amount = sponsor.payPerVisit."
- [ ] **I-6 HTTP:** "Create convex/http.ts with POST /whop/webhook (verify the signature with WHOP\_WEBHOOK\_SECRET, then call internal.whop.handleEvent) and POST /keiki/webhook (call internal.keiki.handleMessage)."

### Gauri (AI, data, sponsors)

- [ ] **G-1 Seed data:** "Create convex/seed.ts with a seedDemo mutation that inserts 30 real San Francisco places (mixed categories, price levels 1-4, 3-5 tags each, real lat/lng, durationMins), 3 demo users (Uma, Ishan, Gauri) with budgets $20/$30/$40, one group 'Hack Crew', 4 past done plans with ratings (include a 5-star escape room), and 3 sponsors with offers. Also create data/thisOrThat.ts with 15 this-or-that pairs (label + emoji for each side + category)."
- [ ] **G-2 Pricing and places:** "Create convex/pricing.ts (priceRange: 1->0-15, 2->15-35, 3->35-70, 4->70-120; fitsBudget(level, budget) is true if range.min <= budget) and convex/places.ts with internal query listCandidates(budgetMax, areas)."
- [ ] **G-3 Memory (do yourself):** "Create convex/memory.ts with "use node" using the supermemory SDK and SUPERMEMORY\_API\_KEY. Implement rememberSwipe, rememberPreferences, rememberRating, getGroupContext and getMyProfile per the contract, with container tags user\_\<id> and group\_\<id>. Memories are short natural sentences."
- [ ] **G-4 Suggestions (do yourself):** "Create convex/suggest.ts with "use node" implementing generateSuggestions(planId) exactly as in feature spec 1, including the system prompt, JSON parsing, the fallback, and the call to internal.plans.saveOptions. Use the openai SDK with JSON response format."
- [ ] **G-5 Solo quests:** "Create convex/solo.ts per the contract and feature spec 5. pickSoloQuest is an internal action that uses memory plus the LLM for a quest line of 12 words or fewer. complete awards 25 points and updates the streak."
- [ ] **G-6 Sponsors:** "Create convex/sponsors.ts per the contract and the slotting rule in feature spec 9-10. redeemReward subtracts diamonds and returns an unused promo code from the rewards table."
- [ ] **G-7 Whop (after 2:00):** "Create convex/whop.ts with "use node". Use the Whop sandbox API at https://sandbox-api.whop.com/api/v1 with Bearer WHOP\_API\_KEY. Implement createSponsorCheckout (create a checkout configuration and return its URL), createDeposit ($5), handleEvent (payment succeeded marks the deposit held) and refundDeposit. Check the Whop docs for exact request bodies."
- [ ] **G-8 Keiki (after 3:30, once the API is confirmed):** "Create convex/keiki.ts implementing handleMessage and sendMessage per the Keiki spec section. \[Paste the Keiki API docs here.\]"

### Uma (app and UI)

- [ ] **U-1 Shell (do yourself, 10:00):** "Set up Expo Router with app/\_layout.tsx (ConvexProvider using EXPO\_PUBLIC\_CONVEX\_URL), app/index.tsx redirect, the (tabs) layout with Home, Groups, Leaderboard and Profile, constants/theme.ts, and lib/session.ts (AsyncStorage userId)."
- [ ] **U-2 Onboarding:** "Build app/onboarding/name.tsx, swipe.tsx (uses data/thisOrThat.ts and components/SwipeCard.tsx, calls api.memory.rememberSwipe per card) and preferences.tsx (budget slider, area picker, diet and vibe chips, calls api.users.updatePreferences) per the screens table."
- [ ] **U-3 Groups and plan:** "Build app/(tabs)/groups.tsx, app/group/new.tsx, app/group/join.tsx, app/group/\[groupId\].tsx and app/plan/\[planId\].tsx with components/OptionCard.tsx and VoteBar.tsx per the screens table. Show live vote counts, a lock banner with confetti and haptics, and a Confirm button."
- [ ] **U-4 Calendar:** "Create lib/calendar.ts with readBusyBlocks() (expo-calendar, next 14 days, returns \[{start,end}\]) and createInvite(plan, place). Wire it into preferences.tsx and plan/\[planId\].tsx on lock."
- [ ] **U-5 Camera and story:** "Build app/camera.tsx (expo-image-picker camera, upload via api.photos.generateUploadUrl, then savePhoto or solo.complete), app/story/\[groupId\].tsx and components/PhotoGrid.tsx."
- [ ] **U-6 Home, rate, leaderboard, profile:** "Build app/(tabs)/home.tsx (QuestCard, upcoming plans, sponsored card), app/rate/\[targetId\].tsx (StarRating + vibe), app/(tabs)/leaderboard.tsx and app/(tabs)/profile.tsx per the screens table."
- [ ] **U-7 Sponsor screens (after 3:30):** "Build app/sponsor/\[sponsorId\].tsx and app/sponsor-dashboard.tsx per the screens table. Open Whop checkout URLs with expo-web-browser."
- [ ] **U-8 Revyl tests (4:30):** Write 3 natural-language tests: (1) onboard → create group → copy invite code; (2) open plan → vote → confirm → see the lock banner; (3) take photo → see it in the story → points go up. Run them on iOS and Android.

### &#91;FUND\] New tasks (do these before any task marked cut)

**Cut:** G-8 (Keiki) and the deposit parts of G-7. G-6 shrinks to `listActive` only.

- [ ] **I-7 Fund ledger (Ishan):** "Create convex/funds.ts, convex/experiences.ts and convex/businesses.ts per the \[FUND\] contract rows. funds.spend must throw if the balance is too low, and must update pots.balance and businesses.earned in the same mutation. Make groups.createGroup call funds.createPot with monthlyContribution 20. Add demo.simulateContribution(groupId, userId, amount)."
- [ ] **G-9 Whop money (Gauri):** "Create convex/whop.ts with "use node". Use the Whop sandbox API at https://sandbox-api.whop.com/api/v1 with Bearer WHOP\_API\_KEY. Implement createContributionCheckout (a checkout configuration for a $amount one-time plan with metadata potId and userId, returning its URL), createExperienceProduct, transferToBusiness (on API error, mark the note ledger-only and don't throw) and handleEvent (on payment success, call internal.funds.recordContribution with the metadata). Check the Whop docs for exact request bodies. Also update convex/http.ts route /whop/webhook to verify WHOP\_WEBHOOK\_SECRET and call handleEvent."
- [ ] **G-10 Mock card (Gauri):** "Create convex/cards.ts with issueCard (internal mutation: random 4-digit last4, status mock-active), getCard (query: card + limit = pot balance) and chargeCard (mutation: amount = experience.pricePerPerson × confirmed members of the plan, calls internal.funds.spend, then schedules internal.whop.transferToBusiness). Keep the function shapes so the real Whop card API can replace the internals."
- [ ] **G-11 Suggestions on the pot (Gauri):** "Update convex/suggest.ts: load the group's pot, then choose candidates from active experiences where pricePerPerson × members ≤ balance, plus at most 1 cheap place. Set options\[\].experienceId, costMin = costMax = pricePerPerson. The why line can mention the pot."
- [ ] **G-12 Seed experiences (Gauri):** "Update convex/seed.ts: add 3 businesses and 7 experiences (realistic SF prices, tags, minGroup/maxGroup) and a pot at $0 for the demo group."
- [ ] **U-9 Fund + card screens (Uma):** "Build app/fund/\[groupId\].tsx and app/card/\[groupId\].tsx per the \[FUND\] screens table. The card is a styled gradient card with the group name, •••• last4 and the balance. Tap to pay shows a receipt sheet. Add the pot balance and links to app/group/\[groupId\].tsx, and a Pay with group card button on a locked plan."
- [ ] **U-10 Explore + business portal (Uma):** "Build app/(tabs)/explore.tsx, app/experience/\[experienceId\].tsx and app/business.tsx per the \[FUND\] screens table."
- [ ] **Revyl test 4 (Uma):** chip in → the pot balance goes up → vote and lock → tap to pay → the balance goes down and a receipt shows.
