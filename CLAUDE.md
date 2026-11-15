# Sidequest

Sidequest is a consumer mobile app built at a one-day hackathon. It turns "we should hang out" into real plans: it suggests 3 outings a friend group will like, fits them to everyone's free time and budget, runs a live vote, and learns from ratings. It also has a daily solo quest, a photo drop and group story, points, and sponsored quests from local businesses.

**Read [docs/SPEC.md](docs/SPEC.md) before any task.** It holds the schema, the API contract, the screens and the task prompts. Read [docs/integration-notes.md](docs/integration-notes.md) for how the AI, data and sponsor backend connects to everything else.

Stack: Expo (React Native, TypeScript, Expo Router) and Convex (database, functions, realtime, file storage, scheduler, crons). Supermemory, OpenAI, Whop and Keiki are called only from Convex actions, never from the phone.

Rules:
- TypeScript everywhere. Use Convex validators (`v`) for every function's args.
- Do not edit `convex/schema.ts` unless the task says so. Only Ishan edits it.
- Every file has one owner (see "Folder and file structure" in the spec). Only create or edit the files your task names.
- Function names, args and return shapes must match the API contract exactly.
- Identify the user with a `userId` arg (simple hackathon auth, stored on the device).
- Keep it simple and demo-ready: clear loading and empty states, no over-engineering.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
