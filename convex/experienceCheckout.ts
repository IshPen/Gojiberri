"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const WHOP_API = process.env.WHOP_API_BASE ?? "https://sandbox-api.whop.com/api/v1";

export const createExperienceCheckout = action({
  args: { experienceId: v.id("experiences"), userId: v.id("users"), groupId: v.optional(v.id("groups")) },
  handler: async (ctx, { experienceId, userId, groupId }): Promise<string> => {
    if (!(await ctx.runQuery(internal.context.getUser, { userId }))) throw new Error("User not found");
    if (groupId) {
      const group = await ctx.runQuery(internal.groups.getInternal, { groupId });
      if (!group?.memberIds.includes(userId)) throw new Error("Only crew members can buy for this crew");
    }

    let found = await ctx.runQuery(internal.context.experienceWithBusiness, { experienceId });
    if (!found?.experience.active || !found.business) throw new Error("This experience isn't for sale");
    if (!found.experience.whopPlanId) {
      await ctx.runAction(internal.whop.createExperienceProduct, { experienceId });
      found = await ctx.runQuery(internal.context.experienceWithBusiness, { experienceId });
    }
    const variantId = found?.experience.whopPlanId;
    if (!variantId) throw new Error("This experience isn't on Whop yet. Try again in a minute");

    const metadata: Record<string, string> = { kind: "experience", experienceId, userId };
    if (groupId) metadata.groupId = groupId;
    const res = await fetch(`${WHOP_API}/checkout_configurations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ account_id: process.env.WHOP_COMPANY_ID, variant_id: variantId, mode: "payment", metadata }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Whop checkout failed (${res.status}): ${text}`);
    const config = JSON.parse(text) as { purchase_url: string | null };
    if (!config.purchase_url) throw new Error("Whop did not return a checkout URL");
    return config.purchase_url;
  },
});
