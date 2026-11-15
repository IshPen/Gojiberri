import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("monthly recurrences", { hours: 1 }, internal.recurrences.runDue, {});

export default crons;
