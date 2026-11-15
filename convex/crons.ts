import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { external, scheduleExternal } from "./refs";

export const assignSolo = internalMutation({
  args: {},
  handler: async (ctx) => {
    await scheduleExternal(ctx, external.assignAll, {});
    return null;
  },
});

const crons = cronJobs();

crons.cron("daily solo quests (8am PT)", "5 15 * * *", internal.crons.assignSolo, {});
crons.interval("monthly recurrences", { hours: 1 }, internal.recurrences.runDue, {});
crons.cron("weekly leaderboard prizes", "7 17 * * 1", internal.points.weeklyPrizes, {});

export default crons;
