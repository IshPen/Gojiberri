export type ThisOrThatSide = { label: string; emoji: string };
export type ThisOrThatPair = { category: string; a: ThisOrThatSide; b: ThisOrThatSide };

export const THIS_OR_THAT: ThisOrThatPair[] = [
  { category: "drinks", a: { label: "Boba run", emoji: "🧋" }, b: { label: "Campus cafe", emoji: "☕" } },
  { category: "food", a: { label: "$3 tacos", emoji: "🌮" }, b: { label: "Dumplings after lecture", emoji: "🥟" } },
  { category: "activity", a: { label: "Escape room with the floor", emoji: "🔐" }, b: { label: "Student-night bowling", emoji: "🎳" } },
  { category: "outdoors", a: { label: "Beach day off-campus", emoji: "🏖️" }, b: { label: "Hike behind campus", emoji: "🥾" } },
  { category: "arts", a: { label: "Free museum day", emoji: "🖼️" }, b: { label: "Improv club show", emoji: "🎤" } },
  { category: "night", a: { label: "Dance till late", emoji: "🪩" }, b: { label: "Board games in the lounge", emoji: "🎲" } },
  { category: "food", a: { label: "Birthday splurge dinner", emoji: "🍽️" }, b: { label: "Cheap eats crawl", emoji: "🍢" } },
  { category: "drinks", a: { label: "Coffee shop crawl", emoji: "☕" }, b: { label: "Smoothie after the gym", emoji: "🥤" } },
  { category: "activity", a: { label: "Climbing gym", emoji: "🧗" }, b: { label: "Mini golf", emoji: "⛳" } },
  { category: "vibe", a: { label: "Your floor vs. theirs", emoji: "🏆" }, b: { label: "Quiet library corner", emoji: "🤫" } },
  { category: "outdoors", a: { label: "Sunset from the campus hill", emoji: "🌅" }, b: { label: "Picnic on the quad", emoji: "🧺" } },
  { category: "arts", a: { label: "$5 student movie", emoji: "🎬" }, b: { label: "Campus open mic", emoji: "🎸" } },
  { category: "food", a: { label: "Dining hall brunch", emoji: "🥞" }, b: { label: "Late-night pizza", emoji: "🍕" } },
  { category: "activity", a: { label: "Thrift store haul", emoji: "🛍️" }, b: { label: "Karaoke", emoji: "🎶" } },
  { category: "vibe", a: { label: "Try a new spot", emoji: "✨" }, b: { label: "Our usual campus spot", emoji: "💛" } },
];
