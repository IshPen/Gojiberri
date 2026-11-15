const CATEGORY_EMOJI: Record<string, string> = { food: "🧋", bar: "🍹", activity: "🧗", outdoors: "🌲", arts: "🎨" };

export const DEFAULT_SCHOOL = "Stanford";
export const SCHOOL_AREAS: Record<string, string[]> = {
  Stanford: ["Stanford", "Palo Alto", "Menlo Park"],
  Berkeley: ["Berkeley", "Oakland", "Emeryville"],
};

export function experienceEmoji(category: string | null) {
  return (category && CATEGORY_EMOJI[category]) || "🎟️";
}

export function groupSize(min: number, max: number) {
  return min === max ? `Group of ${min}` : `Groups of ${min}-${max}`;
}
