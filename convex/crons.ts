import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { external, scheduleExternal } from "./refs";
import { HOUR, localDate, localTime } from "./time";

export const assignSolo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const eightAm = localTime(localDate(now), 8);
    if (now < eightAm || now >= eightAm + HOUR) return null;
    await scheduleExternal(ctx, external.assignAll, {});
    return null;
  },
});

const crons = cronJobs();

crons.cron("solo quests, 8am PDT", "5 15 * * *", internal.crons.assignSolo, {});
crons.cron("solo quests, 8am PST", "5 16 * * *", internal.crons.assignSolo, {});
crons.interval("monthly recurrences", { hours: 1 }, internal.recurrences.runDue, {});
crons.cron("weekly leaderboard prizes", "7 17 * * 1", internal.points.weeklyPrizes, {});

export default crons;
