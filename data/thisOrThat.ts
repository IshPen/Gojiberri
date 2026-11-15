export type ThisOrThatSide = { label: string; emoji: string };
export type ThisOrThatPair = { category: string; a: ThisOrThatSide; b: ThisOrThatSide };

export const THIS_OR_THAT: ThisOrThatPair[] = [
  { category: "drinks", a: { label: "Rooftop bar", emoji: "🌇" }, b: { label: "Cozy cafe", emoji: "☕" } },
  { category: "food", a: { label: "Tacos", emoji: "🌮" }, b: { label: "Dumplings", emoji: "🥟" } },
  { category: "activity", a: { label: "Escape room", emoji: "🔐" }, b: { label: "Bowling", emoji: "🎳" } },
  { category: "outdoors", a: { label: "Beach day", emoji: "🏖️" }, b: { label: "Hiking trail", emoji: "🥾" } },
  { category: "arts", a: { label: "Museum", emoji: "🖼️" }, b: { label: "Comedy show", emoji: "🎤" } },
  { category: "night", a: { label: "Dance till late", emoji: "🪩" }, b: { label: "Board games at home", emoji: "🎲" } },
  { category: "food", a: { label: "Fancy tasting menu", emoji: "🍽️" }, b: { label: "Street food crawl", emoji: "🍢" } },
  { category: "drinks", a: { label: "Craft cocktails", emoji: "🍸" }, b: { label: "Beer garden", emoji: "🍺" } },
  { category: "activity", a: { label: "Rock climbing", emoji: "🧗" }, b: { label: "Mini golf", emoji: "⛳" } },
  { category: "vibe", a: { label: "Lively crowd", emoji: "🎉" }, b: { label: "Quiet corner", emoji: "🤫" } },
  { category: "outdoors", a: { label: "Sunset viewpoint", emoji: "🌅" }, b: { label: "Park picnic", emoji: "🧺" } },
  { category: "arts", a: { label: "Indie movie", emoji: "🎬" }, b: { label: "Live music", emoji: "🎸" } },
  { category: "food", a: { label: "Brunch", emoji: "🥞" }, b: { label: "Late-night pizza", emoji: "🍕" } },
  { category: "activity", a: { label: "Arcade", emoji: "🕹️" }, b: { label: "Karaoke", emoji: "🎶" } },
  { category: "vibe", a: { label: "Try something new", emoji: "✨" }, b: { label: "Old favorite", emoji: "💛" } },
];
