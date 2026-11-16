# Gojiberri: Revyl E2E tests (U-8)

These are three natural-language tests to run on iOS and Android. Each step names the `testID` it targets, so the tests survive copy changes.

## 1. Onboard, create a group, copy the invite code

1. Launch the app fresh (clear app data). The welcome screen shows (`welcome-screen`). Tap `role-student`. The Pick your school screen shows (`school-screen`). Tap `school-chip-stanford`, assert that `school-title` reads "Join the Stanford space", then tap `school-continue`.
2. The Welcome to the Stanford space screen shows (`name-title`). Type "Uma" into `name-input`, tap `avatar-option-2`, then tap `name-continue`.
3. On the This or that? screen, tap `swipe-option-left` or `swipe-option-right`. The school split (`swipe-split`) shows for about a second, then the next pair appears. Repeat for all 5 pairs until the progress bar (`swipe-progress`) completes, or tap `swipe-skip`.
4. On preferences, assert that `school-joined-name` reads "Repping Stanford", tap `diet-chip-vegetarian` and `vibe-chip-cozy`, then tap `preferences-finish`.
5. The For You tab is visible (`recommended-screen`, `home-greeting`). Tap `tab-groups` (labelled Crews), then `create-group-button`.
6. Type "Hack Crew" into `group-name-input` and tap `create-group-submit`.
7. Assert that `invite-code` shows a 6-character uppercase code. Tap `copy-invite-code` and assert that the button reads "Copied!".

## 2. Open a plan, vote, confirm, see the lock banner

1. On the For You tab, tap `pick-plan-0` ("Plan with Hack Crew"). The pick card expands inline (`pick-planner-0`).
2. Tap `free-window-0`, then `plan-outing-button` ("Send to Hack Crew to vote").
3. Assert that the `home-up-next` card on For You shows the plan inline (`plan-inline`): first `plan-generating`, then one idea, `vote-option-0`, with `plan-im-in` ("I'm in") and `plan-reject` ("Not feeling it · 10 Gojis"). If the backend still returns 3 options, only the first is shown. When the crew has several active plans, switch between them with `home-plan-chip-N`. The same panel is still available at /plan/[planId] (`plan-screen`) for deep links and notifications.
4. Tap `plan-im-in`. Assert that `vote-count-0` increases. Once a majority is in, `lock-banner` appears with the winner title (`lock-winner-title`).
5. Tap `confirm-attendance`. Assert that `confirmed-badge` is visible.
6. (Pass on ideas) On a plan that is still voting, tap `plan-reject` ("Not feeling it · 10 Gojis"). Assert that `plan-goji-balance` reads "Spend 10 of your N Gojis to pass?", then tap `plan-reject-confirm`. Assert that `plan-reject-count` starts with "1 of N out, at half we'll find a new idea" and `plan-reject-spent` shows "-10 Gojis". When half or more of the crew opts out, `plan-generating` shows "New idea on the way", then `plan-new-ideas` appears above the new `vote-option-0` idea. Needs votes.rejectOptions (HOME-34) deployed and `REJECT_MOCK = false`.

## 3. Take a photo, see it in the story, Gojis go up

1. Note the value of `home-points-value` on the For You tab.
2. From the group page, tap `story-link`, then `story-add-photo` (or tap `plan-checkin` on the locked plan in For You's `home-up-next` card).
3. Tap `take-photo` (on the simulator, use `choose-photo`) and pick any image. Assert that `photo-preview` is visible.
4. Type "best night" into `caption-input` and tap `upload-photo`.
5. Assert that `upload-success` shows the Goji breakdown (`goji-breakdown`) with a `goji-item-checkin` line, and that `upload-success-points` shows the total (at least "+50 Gojis"). Tap `view-story` and assert that the story opens full screen (`story-viewer-image`, `story-progress-0`). Tap `story-next` to advance and `story-viewer-close` to close.
6. Go back to For You and assert that `home-points-value` is higher than in step 1.

> Note: steps 3.5 and 3.6 need the real backend (`USE_MOCK = false`). With mocks on, the story and points are static demo data.
