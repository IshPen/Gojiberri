export type PriceRange = { min: number; max: number };

const RANGES: Record<number, PriceRange> = {
  1: { min: 0, max: 15 },
  2: { min: 15, max: 35 },
  3: { min: 35, max: 70 },
  4: { min: 70, max: 120 },
};

export function priceRange(level: number): PriceRange {
  const clamped = Math.min(4, Math.max(1, Math.round(level)));
  return RANGES[clamped];
}

export function fitsBudget(level: number, budget: number): boolean {
  return priceRange(level).min <= budget;
}

export function formatRange(level: number): string {
  const { min, max } = priceRange(level);
  return level >= 4 ? `$${min}+` : `$${min}-${max}`;
}
