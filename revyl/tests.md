# Gojiberri: Revyl E2E tests (U-8)

These are three natural-language tests to run on iOS and Android. Each step names the `testID` it targets, so the tests survive copy changes.

## 1. Onboard, create a group, copy the invite code

1. Launch the app fresh (clear app data). The Welcome to Gojiberri screen shows (`name-title`).
2. Type "Uma" into `name-input`, tap `avatar-option-2`, then tap `name-continue`.
3. On the swipe screen, tap `swipe-option-left` or `swipe-option-right` until the progress bar (`swipe-progress`) completes, or tap `swipe-skip`.
4. On preferences, tap `area-chip-Mission`, `diet-chip-vegetarian` and `vibe-chip-cozy`, then tap `preferences-finish`.
5. The Home tab is visible (`home-greeting`). Tap `tab-groups`, then `create-group-button`.
6. Type "Hack Crew" into `group-name-input` and tap `create-group-submit`.
7. Assert that `invite-code` shows a 6-character uppercase code. Tap `copy-invite-code` and assert that the button reads "Copied!".

## 2. Open a plan, vote, confirm, see the lock banner

1. From the Groups tab, tap `group-card-0`.
2. Tap `free-window-0`, then `plan-outing-button`.
3. Assert that `plan-generating` shows, then that `vote-option-0`, `vote-option-1` and `vote-option-2` appear.
4. Tap `vote-option-1`. Assert that `vote-count-1` increases and `lock-banner` appears with the winner title (`lock-winner-title`).
5. Tap `confirm-attendance`. Assert that `confirmed-badge` is visible.

## 3. Take a photo, see it in the story, Gojis go up

1. Note the value of `home-points-value` on the Home tab.
2. From the group page, tap `story-link`, then `story-add-photo` (or open the camera from a plan).
3. Tap `take-photo` (on the simulator, use `choose-photo`) and pick any image. Assert that `photo-preview` is visible.
4. Type "best night" into `caption-input` and tap `upload-photo`.
5. Assert that `upload-success` shows "+50 Gojis" (`upload-success-points`). Tap `view-story` and assert that a `photo-tile-0` is visible.
6. Go back to Home and assert that `home-points-value` is higher than in step 1.

> Note: steps 3.5 and 3.6 need the real backend (`USE_MOCK = false`). With mocks on, the story and points are static demo data.
