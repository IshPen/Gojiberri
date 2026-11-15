import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { addDays, localDate, localTime, MINUTE } from "./time";

const STEP = 30 * MINUTE;
const DAY_START_HOUR = 10;
const DAY_END_HOUR = 22;

export async function freeWindows(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  from: number,
  to: number,
  minHours: number,
  max = 3,
) {
  const group = await ctx.db.get("groups", groupId);
  if (!group) return [];
  const members = await Promise.all(group.memberIds.map((id) => ctx.db.get("users", id)));
  const busy = members
    .flatMap((m) => m?.busyBlocks ?? [])
    .filter((b) => b.end > from && b.start < to)
    .sort((a, b) => a.start - b.start);
  const isFree = (start: number) =>
    !busy.some((b) => b.start < start + STEP && b.end > start);

  const windows: { start: number; end: number }[] = [];
  const minLength = minHours * 60 * MINUTE;
  for (let date = localDate(from); localTime(date, 0) < to && windows.length < max; date = addDays(date, 1)) {
    const dayEnd = Math.min(localTime(date, DAY_END_HOUR), to);
    let t = Math.max(localTime(date, DAY_START_HOUR), Math.ceil(from / STEP) * STEP);
    while (t + minLength <= dayEnd && windows.length < max) {
      if (!isFree(t)) {
        t += STEP;
        continue;
      }
      let end = t;
      while (end < dayEnd && isFree(end)) end += STEP;
      end = Math.min(end, dayEnd);
      if (end - t >= minLength) windows.push({ start: t, end });
      t = end + STEP;
    }
  }
  return windows;
}

export const findFreeWindows = query({
  args: {
    groupId: v.id("groups"),
    from: v.number(),
    to: v.number(),
    minHours: v.number(),
  },
  handler: async (ctx, { groupId, from, to, minHours }) => {
    return await freeWindows(ctx, groupId, from, to, minHours);
  },
});
