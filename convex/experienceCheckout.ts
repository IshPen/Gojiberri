"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const WHOP_API = env.WHOP_API_BASE ?? "https://sandbox-api.whop.com/api/v1";

const createPending = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; experienceId: Id<"experiences">; groupId?: Id<"groups">; quantity: number },
  Id<"experiencePurchases">
>("purchases:createPending");
const attachCheckout = makeFunctionReference<
  "mutation",
  { purchaseId: Id<"experiencePurchases">; whopCheckoutId: string; checkoutUrl: string },
  null
>("purchases:attachCheckout");
const failCheckout = makeFunctionReference<"mutation", { purchaseId: Id<"experiencePurchases">; reason: string }, null>(
  "purchases:failCheckout",
);

export const createExperienceCheckout = action({
  args: { experienceId: v.id("experiences"), userId: v.id("users"), groupId: v.optional(v.id("groups")) },
  handler: async (ctx, { experienceId, userId, groupId }): Promise<string> => {
    let found = await ctx.runQuery(internal.context.experienceWithBusiness, { experienceId });
    if (!found?.experience.active || !found.business) throw new Error("This experience isn't for sale");
    if (!found.experience.whopPlanId || (env.WHOP_MOCK !== "true" && found.experience.whopPlanId.startsWith("plan_mock_"))) {
      await ctx.runAction(internal.whop.createExperienceProduct, { experienceId });
      found = await ctx.runQuery(internal.context.experienceWithBusiness, { experienceId });
    }
    const variantId = found?.experience.whopPlanId;
    if (!variantId || (env.WHOP_MOCK !== "true" && variantId.startsWith("plan_mock_"))) {
      throw new Error("This experience isn't on Whop yet. Try again in a minute");
    }

    const purchaseId = await ctx.runMutation(createPending, { userId, experienceId, groupId, quantity: 1 });
    if (env.WHOP_MOCK === "true") {
      return await ctx.runMutation(internal.whopMock.createExperience, {
        purchaseId,
        token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      });
    }
    const metadata: Record<string, string> = { kind: "experience", purchaseId, experienceId, userId };
    if (groupId) metadata.groupId = groupId;
    try {
      const res = await fetch(`${WHOP_API}/checkout_configurations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHOP_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ account_id: env.WHOP_COMPANY_ID, variant_id: variantId, mode: "payment", metadata }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Whop checkout failed (${res.status}): ${text}`);
      const config = JSON.parse(text) as { id: string; purchase_url: string | null };
      if (!config.purchase_url) throw new Error("Whop did not return a checkout URL");
      await ctx.runMutation(attachCheckout, { purchaseId, whopCheckoutId: config.id, checkoutUrl: config.purchase_url });
      return config.purchase_url;
    } catch (err) {
      await ctx.runMutation(failCheckout, { purchaseId, reason: String(err).slice(0, 500) });
      throw err;
    }
  },
});
