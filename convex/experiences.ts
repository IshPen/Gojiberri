import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { scheduleExternal } from "./refs";

// Gauri's whop.ts (#7), referenced by name so this file deploys before it lands.
const createExperienceProduct = makeFunctionReference<"action", { experienceId: Id<"experiences"> }, null>(
  "whop:createExperienceProduct",
);

export const listExperiences = query({
  args: { maxPerPerson: v.optional(v.number()), tags: v.optional(v.array(v.string())) },
  handler: async (ctx, { maxPerPerson, tags }) => {
    const experiences = (await ctx.db.query("experiences").take(500))
      .filter((e) => e.active)
      .filter((e) => maxPerPerson === undefined || e.pricePerPerson <= maxPerPerson)
      .filter((e) => !tags?.length || e.tags.some((t) => tags.includes(t)))
      .sort((a, b) => a.pricePerPerson - b.pricePerPerson);
    return await Promise.all(
      experiences.map(async (e) => ({
        ...e,
        businessName: (await ctx.db.get("businesses", e.businessId))?.name ?? "",
      })),
    );
  },
});

export const getExperience = query({
  args: { experienceId: v.id("experiences") },
  handler: async (ctx, { experienceId }) => {
    const experience = await ctx.db.get("experiences", experienceId);
    if (!experience) return null;
    const business = await ctx.db.get("businesses", experience.businessId);
    return { ...experience, businessName: business?.name ?? "" };
  },
});

export const createExperience = mutation({
  args: {
    businessId: v.id("businesses"),
    title: v.string(),
    description: v.string(),
    pricePerPerson: v.number(),
    minGroup: v.number(),
    maxGroup: v.number(),
    tags: v.array(v.string()),
    placeId: v.optional(v.id("places")),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await ctx.db.get("businesses", args.businessId))) throw new ConvexError("Business not found");
    if (!args.title.trim()) throw new ConvexError("Give the experience a title");
    if (!(args.pricePerPerson > 0)) throw new ConvexError("Price per person must be more than $0");
    if (args.minGroup < 1 || args.maxGroup < args.minGroup) throw new ConvexError("Check the group size range");
    const experienceId = await ctx.db.insert("experiences", { ...args, title: args.title.trim(), active: true });
    await scheduleExternal(ctx, createExperienceProduct, { experienceId });
    return experienceId;
  },
});
