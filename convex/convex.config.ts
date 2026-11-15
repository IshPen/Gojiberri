import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    DEMO_MODE: v.optional(v.string()),
    SUPERMEMORY_API_KEY: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    WHOP_API_KEY: v.optional(v.string()),
    WHOP_API_BASE: v.optional(v.string()),
    WHOP_COMPANY_ID: v.optional(v.string()),
    WHOP_PRODUCT_ID: v.optional(v.string()),
    WHOP_WEBHOOK_SECRET: v.optional(v.string()),
    KEIKI_API_KEY: v.optional(v.string()),
    KEIKI_WEBHOOK_SECRET: v.optional(v.string()),
    GOOGLE_PLACES_API_KEY: v.optional(v.string()),
  },
});

export default app;
