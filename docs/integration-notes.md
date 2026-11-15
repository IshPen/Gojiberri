# Integration notes (Gauri's backend: AI, data, sponsors)

The full spec lives in [SPEC.md](./SPEC.md). This page covers what the G-tasks added on top of the contract, and what Ishan and Uma need to wire up.

## Files

| File | What it does |
| --- | --- |
| `convex/seed.ts` | `seedDemo` wipes the demo tables, then inserts 30 SF places, Uma/Ishan/Gauri, the group "Hack Crew" (invite code `HACK42`), 4 past plans with ratings, 3 sponsors and their promo codes, and schedules the Supermemory writes |
| `data/thisOrThat.ts` | `THIS_OR_THAT`: 15 pairs of `{ category, a: { label, emoji }, b: { label, emoji } }` |
| `convex/pricing.ts` | `priceRange`, `fitsBudget`, `formatRange` (plain helpers, importable from the app too) |
| `convex/places.ts` | `listCandidates` (iQ), plus the `travelEstimate` and `rideShareLink` helpers |
| `convex/memory.ts` | Supermemory: `rememberSwipe`, `rememberPreferences`, `rememberRating`, `getGroupContext`, `getMyProfile` |
| `convex/suggest.ts` | `generateSuggestions`. If the LLM fails, it falls back to the top 3 places by tag overlap |
| `convex/solo.ts` | `getToday`, `pickSoloQuest`, `assignAll`, `complete` |
| `convex/sponsors.ts` | `listActive` (each sponsor with its `place`), `pickSponsored`, `redeemReward` (returns `{ code, offer, business }`), `stats` |
| `convex/whop.ts` | `createSponsorCheckout`, `createDeposit`, `handleEvent`, `refundDeposit`, `refundForCheckin` |
| `convex/keiki.ts` | `handleMessage`, `sendMessage`, `announceLock` |
| `convex/context.ts` | Internal queries and mutations that the `"use node"` actions above use to read and write the database |
| `convex/llm.ts` | OpenAI JSON and text helpers |

## Ishan: hooks to call from your files

- `plans.createPlan` → `ctx.scheduler.runAfter(0, internal.suggest.generateSuggestions, { planId })`
- `users.updatePreferences` → `internal.memory.rememberPreferences, { userId }`
- `ratings.submitRating` → `internal.memory.rememberRating, { ratingId }`
- When a plan locks (in `castVote` and on the auto-lock at confirmBy) → `internal.keiki.announceLock, { planId }`. It does nothing if the group has no linked chat
- `photos.savePhoto` on a plan check-in → `internal.whop.refundForCheckin, { planId, userId }`
- `reminders.dropUnconfirmed` → `ctx.runMutation(internal.context.forfeitDeposits, { planId, userIds })`
- `http.ts` `/whop/webhook` → `internal.whop.handleEvent, { event }`, passing the parsed JSON body. `/keiki/webhook` → `internal.keiki.handleMessage, { chatId, sender, text }`
- `crons.ts` → `internal.solo.assignAll`. `demo.assignSoloNow` can schedule `internal.solo.pickSoloQuest, { userId }`
- `solo.complete` saves its own photo, inserts the sponsor visit and calls `internal.points.award` with reason `"solo"`. It does not call `savePhoto`, so the user doesn't also get the +50 check-in points

The G files reference `internal.plans.saveOptions`, `internal.points.award`, `api.plans.createPlan`, `api.votes.castVote` and `api.availability.findFreeWindows` with the contract's args, so `convex dev` won't typecheck until those exist.

## Uma: notes for the screens

- Swipe: `api.memory.rememberSwipe({ userId, chosen: a.label, rejected: b.label, category })`
- Home: `api.solo.getToday({ userId })` returns `{ quest, place, sponsor, streak }` or `null`. Sponsored cards come from `api.sponsors.listActive`
- Profile: `api.memory.getMyProfile({ userId })` returns `string[]`
- Camera with `?questId=`: `api.solo.complete({ userId, questId, storageId })` returns `{ photoId, streak }`
- `whop.createDeposit` and `whop.createSponsorCheckout` return a URL. Open it with `expo-web-browser`

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

`npx convex run seed:seedDemo` resets and seeds everything. Supermemory processes memories in the background, so seed a minute before you demo suggestions.
