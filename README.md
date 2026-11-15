# Convex + TypeScript + ESLint

The app connects to the shared demo deployment (`https://flippant-marten-689.convex.cloud`) when no `.env` is present. To use a different deployment, copy `.env.example` to `.env` and set `EXPO_PUBLIC_CONVEX_URL`.

This template provides a minimal setup to get Convex working, with TypeScript
and ESLint.

Start by editing `convex/myFunctions.ts` and interact with your backend from the
dashboard or via the CLI:

```sh
npx convex run myFunctions:myQuery '{"first": 1, "second": "Hello"}'
```

See Convex docs at https://docs.convex.dev/home

## Setting up

```
npm create convex@latest -t bare
```
