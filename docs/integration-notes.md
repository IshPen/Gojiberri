# Integration notes (Gauri's backend: AI, data, sponsors)

The full spec lives in [SPEC.md](./SPEC.md). This page covers what the G-tasks added on top of the contract, and what Ishan and Uma need to wire up.

## Files

| File | What it does |
| --- | --- |
| `convex/seed.ts` | `seedDemo` refuses to run if places already exist (clear them with `demo.resetDemo` first). Otherwise it inserts 30 SF places, Uma/Ishan/Gauri, the group "Hack Crew" (invite code `HACK42`), 4 past plans with ratings, 3 sponsors and their promo codes, and schedules the Supermemory writes |
| `data/thisOrThat.ts` | `THIS_OR_THAT`: 15 pairs of `{ category, a: { label, emoji }, b: { label, emoji } }` |
| `convex/pricing.ts` | `priceRange`, `fitsBudget`, `formatRange` (plain helpers, importable from the app too) |
| `convex/places.ts` | `listCandidates` (iQ), plus the `travelEstimate` and `rideShareLink` helpers |
| `convex/memory.ts` | Supermemory: `rememberSwipe`, `rememberPreferences`, `rememberRating`, `getGroupContext`, `getMyProfile` |
| `convex/suggest.ts` | `generateSuggestions`. If the LLM fails, it falls back to the top 3 places by tag overlap |
| `convex/solo.ts` | `getToday`, `pickSoloQuest`, `assignAll`, `complete` |
| `convex/sponsors.ts` | `listActive` (each sponsor with its `place`), `pickSponsored`, `redeemReward` (returns `{ code, offer, business }`), `stats` |
| `convex/whop.ts` | `createSponsorCheckout` for the sponsor dashboard. The rest is in the [FUND] section below |
| `convex/keiki.ts` | `handleMessage`, `sendMessage`, `announceLock` |
| `convex/context.ts` | Internal queries and mutations that the `"use node"` actions above use to read and write the database |
| `convex/llm.ts` | OpenAI JSON and text helpers (plain `fetch`, so they work in any runtime) |

## Ishan: hooks to call from your files

- `plans.createPlan` → `ctx.scheduler.runAfter(0, internal.suggest.generateSuggestions, { planId })`
- `users.updatePreferences` → `internal.memory.rememberPreferences, { userId }`
- `ratings.submitRating` → `internal.memory.rememberRating, { ratingId }`
- When a plan locks (in `castVote` and on the auto-lock at confirmBy) → `internal.keiki.announceLock, { planId }`. It does nothing if the group has no linked chat
- Keiki only acts on "plan" and "vote" when the chat sender's name exactly matches one member's Sidequest name
- `http.ts` `/whop/webhook` → `internal.whop.handleEvent, { event }`, passing the parsed JSON body. `/keiki/webhook` → `internal.keiki.handleMessage, { chatId, sender, text }`
- `crons.ts` → `internal.solo.assignAll`. `demo.assignSoloNow` can schedule `internal.solo.pickSoloQuest, { userId }`
- `solo.complete` saves its own photo, inserts the sponsor visit and calls `internal.points.award` with reason `"solo"`. It does not call `savePhoto`, so the user doesn't also get the +50 check-in points

The G files reference `internal.plans.saveOptions`, `internal.points.award`, `api.plans.createPlan`, `api.votes.castVote` and `api.availability.findFreeWindows` with the contract's args, so `convex dev` won't typecheck until those exist.

## Uma: notes for the screens

- Swipe: `api.memory.rememberSwipe({ userId, chosen: a.label, rejected: b.label, category })`
- Home: `api.solo.getToday({ userId, date })` returns `{ quest, place, sponsor, streak }` or `null`. Pass `date` as the phone's `YYYY-MM-DD` so the query moves to the new day at midnight; without it, the server's PT date is used. `solo.complete` only accepts today's quest. Sponsored cards come from `api.sponsors.listActive`
- Profile: `api.memory.getMyProfile({ userId })` returns `string[]`
- Camera with `?questId=`: `api.solo.complete({ userId, questId, storageId })` returns `{ photoId, streak }`

## [FUND] Group fund, experiences and card (G-9 to G-12)

| File | What it does |
| --- | --- |
| `convex/whop.ts` | `createContributionCheckout(userId, groupId, amount)` returns a Whop checkout URL with metadata `{kind: "contribution", potId, userId, amount}`. `handleEvent` turns `payment.succeeded` into `funds.recordContribution` and skips payment ids it already recorded. `createExperienceProduct(experienceId)` creates a Whop product plus a one-time variant (Whop's replacement for plans) and saves both ids. `transferToBusiness(transactionId)` sends a Whop balance transfer to `business.whopAccountId`; if there's no account or Whop refuses, it sets the transaction note to `ledger-only` and doesn't throw |
| `convex/cards.ts` | **Mock card.** `issueCard(groupId)` (iM) makes a random last4 with status `mock-active`. `getCard(groupId)` returns `{ card, groupName, limit }` with limit = pot balance. `chargeCard(userId, groupId, planId)` requires a locked plan whose winning option has an `experienceId`, charges pricePerPerson × confirmed members through `funds.spend`, refuses a second charge for the same plan, schedules `transferToBusiness`, and returns a receipt `{ amount, people, experience, business, last4, balance, transactionId }` |
| `convex/suggest.ts` | Keeps active experiences where pricePerPerson × members ≤ pot balance, plus 1 cheap place. If fewer than 3 experiences fit (for example while the pot is still $0), it fills the gap with cheap places so the vote still has 3 options. Experience options carry `experienceId` and costMin = costMax = pricePerPerson |
| `convex/seed.ts` | Adds 3 businesses (Palace Games, SF Makers Collective, Bay Adventures), 7 experiences at real venues, a $0 pot with `monthlyContribution` 20 for Hack Crew, and its mock card |

**Ishan (I-7):** `whop.ts` and `cards.ts` call `funds:recordContribution` and `funds:spend` by name, with the contract's args. `chargeCard` uses `spend`'s return value as the transaction id when it's a string, and otherwise reads the newest transaction in the pot. Please return the id. `groups.createGroup` → `createPot` should call `internal.cards.issueCard`. Please also add `pots`, `transactions`, `cards`, `experiences` and `businesses` to `DEMO_TABLES` in `demo.ts` so `resetDemo` clears them. This PR adds `experienceId` to `optionValidator` in `plans.ts` and the [FUND] tables to `schema.ts`, copied word for word from the spec.

**Uma:** Fund screen: open `whop.createContributionCheckout`'s URL with `expo-web-browser`. Card screen: `cards.getCard` and `cards.chargeCard` (use the receipt it returns). Option cards: show "$X from your $Y pot" when `experienceId` is set.

**Env:** `WHOP_COMPANY_ID` (`biz_...`) is the account that creates the checkouts and products and sends the transfers. To get real transfers, set `whopAccountId` on a business; otherwise the ledger is the source of truth.

**Cut:** the $5 deposit is gone, and Keiki is cut. `keiki.ts` is left in place but unused.

## Environment variables

Set these on every dev deployment with `npx convex env set`:

| Variable | Required | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | Without it, suggestions and quests use their fallbacks |
| `OPENAI_MODEL` | no | Defaults to `gpt-4.1-mini` |
| `SUPERMEMORY_API_KEY` | yes | Without it, memory reads come back empty |
| `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET` | for Whop | Sandbox key |
| `WHOP_COMPANY_ID` | for Whop | `biz_...`, the account the checkout variants are created under |
| `WHOP_PRODUCT_ID` | for Whop | `prod_...` (optional) |
| `WHOP_API_BASE` | no | Defaults to the sandbox, `https://sandbox-api.whop.com/api/v1` |
| `KEIKI_API_KEY` | for Keiki | |
| `KEIKI_API_URL` | for Keiki | **The Keiki API is not confirmed yet.** The code sends `POST {KEIKI_API_URL}/chats/{chatId}/messages` with `{ text }` |
| `APP_DEEP_LINK` | no | Defaults to `sidequest://`, used in the lock message |

## Demo

`npx convex run seed:seedDemo` seeds an empty deployment. Supermemory processes memories in the background, so seed a minute before you demo suggestions.
