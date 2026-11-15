# Gojiberri: Revyl E2E tests (U-8)

These are three natural-language tests to run on iOS and Android. Each step names the `testID` it targets, so the tests survive copy changes.

## 1. Onboard, create a group, copy the invite code

1. Launch the app fresh (clear app data). The Pick your school screen shows (`school-screen`). Tap `school-chip-stanford`, assert that `school-title` reads "Join the Stanford space", then tap `school-continue`.
2. The Welcome to the Stanford space screen shows (`name-title`). Type "Uma" into `name-input`, tap `avatar-option-2`, then tap `name-continue`.
3. On the swipe screen, tap `swipe-option-left` or `swipe-option-right` until the progress bar (`swipe-progress`) completes, or tap `swipe-skip`.
4. On preferences, assert that `school-joined-name` reads "Repping Stanford", tap `diet-chip-vegetarian` and `vibe-chip-cozy`, then tap `preferences-finish`.
5. The For You tab is visible (`recommended-screen`, `home-greeting`). Tap `tab-groups` (labelled Crews), then `create-group-button`.
6. Type "Hack Crew" into `group-name-input` and tap `create-group-submit`.
7. Assert that `invite-code` shows a 6-character uppercase code. Tap `copy-invite-code` and assert that the button reads "Copied!".

## 2. Open a plan, vote, confirm, see the lock banner

1. On the For You tab, tap `pick-plan-0` ("Plan this with Hack Crew"). Assert that the crew page opens with `group-pick-banner` showing the pick (`group-pick-title`). Alternatively, from the Crews tab (`tab-groups`), tap `group-card-0`.
2. Tap `free-window-0`, then `plan-outing-button`.
3. Assert that `plan-generating` shows, then that `vote-option-0`, `vote-option-1` and `vote-option-2` appear.
4. Tap `vote-option-1`. Assert that `vote-count-1` increases and `lock-banner` appears with the winner title (`lock-winner-title`).
5. Tap `confirm-attendance`. Assert that `confirmed-badge` is visible.
6. (Pass on ideas) On a plan that is still voting, tap `plan-reject` ("Not feeling these · 10 Gojis"), then `plan-reject-confirm`. Assert that `plan-reject-count` reads "1 of N passed", `plan-reject-spent` shows "-10 Gojis" and `plan-goji-balance` dropped by 10. When more than half the crew passes, `plan-generating` shows "New ideas on the way", then `plan-new-ideas` appears above 3 new `vote-option-*` cards. Needs votes.rejectOptions (HOME-34) deployed and `REJECT_MOCK = false`.

## 3. Take a photo, see it in the story, Gojis go up

1. Note the value of `home-points-value` on the For You tab.
2. From the group page, tap `story-link`, then `story-add-photo` (or tap `home-crew-checkin` on For You, or `plan-checkin` on a locked plan).
3. Tap `take-photo` (on the simulator, use `choose-photo`) and pick any image. Assert that `photo-preview` is visible.
4. Type "best night" into `caption-input` and tap `upload-photo`.
5. Assert that `upload-success` shows "+50 Gojis" (`upload-success-points`). Tap `view-story` and assert that a `photo-tile-0` is visible.
6. Go back to For You and assert that `home-points-value` is higher than in step 1.

> Note: steps 3.5 and 3.6 need the real backend (`USE_MOCK = false`). With mocks on, the story and points are static demo data.
