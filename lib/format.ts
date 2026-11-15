import { brand } from "../constants/theme";

export const PRICE_LEVELS: Record<number, { min: number; max: number | null }> = {
  1: { min: 0, max: 15 },
  2: { min: 15, max: 35 },
  3: { min: 35, max: 70 },
  4: { min: 70, max: null },
};

export function formatMoneyRange(min: number, max: number | null): string {
  if (max === null) return `$${min}+`;
  if (min === max) return `$${min}`;
  return `$${min}–${max}`;
}

export function formatPriceLevel(level: number): string {
  const range = PRICE_LEVELS[level];
  return range ? formatMoneyRange(range.min, range.max) : "$?";
}

export function formatCostPerPerson(costMin: number, costMax: number): string {
  return `${formatMoneyRange(costMin, costMax)} / person`;
}

export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatWindow(window: { start: number; end: number }): string {
  return `${formatDay(window.start)} · ${formatTime(window.start)}–${formatTime(window.end)}`;
}

export function formatCountdown(targetMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, targetMs - nowMs);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatGojis(points: number): string {
  return `${points.toLocaleString()} ${points === 1 ? brand.pointsSingular : brand.points}`;
}

export function formatRewards(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? brand.rewardSingular : brand.rewards}`;
}

export function cleanTitle(title: string): string {
  return title.replace(/^demo:\s*/i, "");
}
