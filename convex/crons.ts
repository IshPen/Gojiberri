import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("monthly recurrences", { hours: 1 }, internal.recurrences.runDue, {});
crons.cron("weekly leaderboard prizes", "7 17 * * 1", internal.points.weeklyPrizes, {});

export default crons;
