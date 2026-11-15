const CATEGORY_EMOJI: Record<string, string> = { food: "🧋", bar: "🍹", activity: "🧗", outdoors: "🌲", arts: "🎨" };

export const DEFAULT_SCHOOL = "Stanford";
export const SCHOOL_AREAS: Record<string, string[]> = {
  Stanford: ["Stanford", "Palo Alto", "Menlo Park"],
  Berkeley: ["Berkeley", "Oakland", "Emeryville"],
};

const KEYWORD_EMOJI: [RegExp, string][] = [
  [/coffee|cafe|café|latte|espresso/, "☕"],
  [/boba|bubble tea|milk tea/, "🧋"],
  [/pizza/, "🍕"],
  [/taco|burrito|mexican/, "🌮"],
  [/ramen|noodle|pho/, "🍜"],
  [/sushi/, "🍣"],
  [/ice cream|gelato|dessert/, "🍦"],
  [/burger/, "🍔"],
  [/concert|music|karaoke/, "🎵"],
  [/book/, "📚"],
];

export function experienceEmoji(category: string | null, hints: (string | undefined)[] = []) {
  const text = hints.filter(Boolean).join(" ").toLowerCase();
  const match = KEYWORD_EMOJI.find(([re]) => re.test(text));
  return match?.[1] ?? ((category && CATEGORY_EMOJI[category]) || "🎟️");
}

export function groupSize(min: number, max: number) {
  return min === max ? `Group of ${min}` : `Groups of ${min}-${max}`;
}
