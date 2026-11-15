import { makeFunctionReference, FunctionReference } from "convex/server";
import { GenericMutationCtx } from "convex/server";
import { DataModel, Id } from "./_generated/dataModel";

// Functions owned by other teammates' modules (suggest, memory, solo, whop, keiki, seed).
// Referenced by name so this backend deploys before those files exist.
export const external = {
  generateSuggestions: makeFunctionReference<"action", { planId: Id<"plans"> }, null>(
    "suggest:generateSuggestions",
  ),
  rememberPreferences: makeFunctionReference<"action", { userId: Id<"users"> }, null>(
    "memory:rememberPreferences",
  ),
  rememberRating: makeFunctionReference<"action", { ratingId: Id<"ratings"> }, null>(
    "memory:rememberRating",
  ),
  pickSoloQuest: makeFunctionReference<"action", { userId: Id<"users"> }, null>(
    "solo:pickSoloQuest",
  ),
  assignAll: makeFunctionReference<"action", Record<string, never>, null>("solo:assignAll"),
  refundDeposit: makeFunctionReference<"action", { depositId: Id<"deposits"> }, null>(
    "whop:refundDeposit",
  ),
  handleWhopEvent: makeFunctionReference<"action", { event: any }, null>("whop:handleEvent"),
  handleKeikiMessage: makeFunctionReference<
    "action",
    { chatId: string; sender: string; text: string },
    null
  >("keiki:handleMessage"),
  sendKeikiMessage: makeFunctionReference<"action", { chatId: string; text: string }, null>(
    "keiki:sendMessage",
  ),
  seedDemo: makeFunctionReference<"mutation", Record<string, never>, any>("seed:seedDemo"),
};

export async function scheduleExternal<Args extends Record<string, any>>(
  ctx: GenericMutationCtx<DataModel>,
  ref: FunctionReference<"action" | "mutation", "public" | "internal", Args>,
  args: Args,
  delayMs = 0,
) {
  try {
    await ctx.scheduler.runAfter(delayMs, ref as any, args);
    return true;
  } catch (e) {
    console.warn("Skipped scheduling a function that isn't deployed yet:", String(e));
    return false;
  }
}
