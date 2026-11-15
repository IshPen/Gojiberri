export type ThisOrThatSide = { label: string; emoji: string };
export type ThisOrThatPair = { category: string; a: ThisOrThatSide; b: ThisOrThatSide };

export const THIS_OR_THAT: ThisOrThatPair[] = [
  { category: "drinks", a: { label: "Boba run", emoji: "🧋" }, b: { label: "Campus coffee", emoji: "☕" } },
  { category: "food", a: { label: "Late-night burrito", emoji: "🌯" }, b: { label: "Dumplings", emoji: "🥟" } },
  { category: "activity", a: { label: "Climbing gym", emoji: "🧗" }, b: { label: "Bowling", emoji: "🎳" } },
  { category: "outdoors", a: { label: "Beach bonfire", emoji: "🔥" }, b: { label: "Hike to the Big C", emoji: "🥾" } },
  { category: "arts", a: { label: "Free museum night", emoji: "🖼️" }, b: { label: "Campus comedy show", emoji: "🎤" } },
  { category: "night", a: { label: "Dance party", emoji: "🪩" }, b: { label: "Board games in the dorm", emoji: "🎲" } },
  { category: "food", a: { label: "Dining hall", emoji: "🍽️" }, b: { label: "Street food crawl", emoji: "🍢" } },
  { category: "drinks", a: { label: "Study café", emoji: "📚" }, b: { label: "Beer garden (21+)", emoji: "🍺" } },
  { category: "activity", a: { label: "Thrift haul", emoji: "🛍️" }, b: { label: "Mini golf", emoji: "⛳" } },
  { category: "vibe", a: { label: "Whole floor comes", emoji: "🎉" }, b: { label: "Just the core crew", emoji: "🤫" } },
  { category: "outdoors", a: { label: "Sunset at Indian Rock", emoji: "🌅" }, b: { label: "Picnic on the glade", emoji: "🧺" } },
  { category: "arts", a: { label: "Indie movie", emoji: "🎬" }, b: { label: "Live music", emoji: "🎸" } },
  { category: "food", a: { label: "Brunch after a midterm", emoji: "🥞" }, b: { label: "Late-night pizza", emoji: "🍕" } },
  { category: "activity", a: { label: "Arcade", emoji: "🕹️" }, b: { label: "Karaoke", emoji: "🎶" } },
  { category: "vibe", a: { label: "Try something new", emoji: "✨" }, b: { label: "Old favorite", emoji: "💛" } },
];
