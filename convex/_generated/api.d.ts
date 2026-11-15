/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as availability from "../availability.js";
import type * as businessDashboard from "../businessDashboard.js";
import type * as businesses from "../businesses.js";
import type * as cards from "../cards.js";
import type * as context from "../context.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as experienceCheckout from "../experienceCheckout.js";
import type * as experienceShop from "../experienceShop.js";
import type * as experiences from "../experiences.js";
import type * as funds from "../funds.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as keiki from "../keiki.js";
import type * as llm from "../llm.js";
import type * as memory from "../memory.js";
import type * as notifications from "../notifications.js";
import type * as novelty from "../novelty.js";
import type * as photos from "../photos.js";
import type * as places from "../places.js";
import type * as plans from "../plans.js";
import type * as points from "../points.js";
import type * as pots from "../pots.js";
import type * as pricing from "../pricing.js";
import type * as purchases from "../purchases.js";
import type * as ratings from "../ratings.js";
import type * as recs from "../recs.js";
import type * as recurrences from "../recurrences.js";
import type * as redemptions from "../redemptions.js";
import type * as refs from "../refs.js";
import type * as reminders from "../reminders.js";
import type * as seed from "../seed.js";
import type * as sponsors from "../sponsors.js";
import type * as suggest from "../suggest.js";
import type * as taste from "../taste.js";
import type * as time from "../time.js";
import type * as users from "../users.js";
import type * as votes from "../votes.js";
import type * as whop from "../whop.js";
import type * as whopMock from "../whopMock.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  availability: typeof availability;
  businessDashboard: typeof businessDashboard;
  businesses: typeof businesses;
  cards: typeof cards;
  context: typeof context;
  crons: typeof crons;
  demo: typeof demo;
  experienceCheckout: typeof experienceCheckout;
  experienceShop: typeof experienceShop;
  experiences: typeof experiences;
  funds: typeof funds;
  groups: typeof groups;
  http: typeof http;
  keiki: typeof keiki;
  llm: typeof llm;
  memory: typeof memory;
  notifications: typeof notifications;
  novelty: typeof novelty;
  photos: typeof photos;
  places: typeof places;
  plans: typeof plans;
  points: typeof points;
  pots: typeof pots;
  pricing: typeof pricing;
  purchases: typeof purchases;
  ratings: typeof ratings;
  recs: typeof recs;
  recurrences: typeof recurrences;
  redemptions: typeof redemptions;
  refs: typeof refs;
  reminders: typeof reminders;
  seed: typeof seed;
  sponsors: typeof sponsors;
  suggest: typeof suggest;
  taste: typeof taste;
  time: typeof time;
  users: typeof users;
  votes: typeof votes;
  whop: typeof whop;
  whopMock: typeof whopMock;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
