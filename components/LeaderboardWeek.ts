import { useEffect, useState } from "react";
import { addDays, HOUR, localDate, localTime, MINUTE, weekday } from "../convex/time";

export const TREND_MOCK = true;

export function weekWindow(now: number) {
  const today = localDate(now);
  const dayIndex = (weekday(today) + 6) % 7;
  return { dayIndex, endsAt: localTime(addDays(today, 7 - dayIndex), 0) };
}

export function useWeek() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(id);
  }, []);
  const { dayIndex, endsAt } = weekWindow(now);
  const left = Math.max(0, endsAt - now);
  const days = Math.floor(left / (24 * HOUR));
  const hours = Math.floor((left % (24 * HOUR)) / HOUR);
  const minutes = Math.floor((left % HOUR) / MINUTE);
  return { dayIndex, endsIn: days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m` };
}

export function weekTrend(key: string, points: number, dayIndex: number): (number | null)[] {
  let seed = 0;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const weights = Array.from({ length: dayIndex + 1 }, (_, d) => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return d === 0 ? 0.3 + (seed % 100) / 100 : (seed % 100) / 100;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let sum = 0;
  return Array.from({ length: 7 }, (_, d) => {
    if (d > dayIndex) return null;
    sum += weights[d];
    return d === dayIndex ? points : (points * sum) / total;
  });
}

export function rankShifts<T>(rows: T[], keyOf: (row: T) => string, trendOf: (row: T) => (number | null)[], dayIndex: number) {
  const shifts = new Map<string, number>();
  if (dayIndex === 0) return shifts;
  const yesterday = rows
    .map((row) => ({ key: keyOf(row), value: trendOf(row)[dayIndex - 1] ?? 0 }))
    .sort((a, b) => b.value - a.value);
  rows.forEach((row, rank) => {
    const before = yesterday.findIndex((y) => y.key === keyOf(row));
    if (before !== rank) shifts.set(keyOf(row), before - rank);
  });
  return shifts;
}
