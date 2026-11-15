export const colors = {
  accent: "#E5394B",
  accentDark: "#B82235",
  accentSoft: "#FDE3E4",
  background: "#FFF8F3",
  card: "#FFFFFF",
  cardMuted: "#F7EEE8",
  text: "#221A18",
  textMuted: "#7B6E69",
  textOnAccent: "#FFFFFF",
  border: "#EFE2DA",
  success: "#2E9E62",
  successSoft: "#DFF4E8",
  warning: "#E8A33B",
  warningSoft: "#FCF0DA",
  danger: "#D4342B",
  dangerSoft: "#FBE1DF",
  gold: "#F2B630",
  overlay: "rgba(34, 26, 24, 0.45)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
};

export const font = {
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    hero: 36,
  },
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
};

export const minTapTarget = 44;

export const shadow = {
  card: {
    shadowColor: "#4A2A20",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
};

export const brand = {
  name: "Gojiberri",
  emoji: "🍓",
  points: "Gojis",
  pointsSingular: "Goji",
  pointsEmoji: "🍓",
  rewards: "rewards",
  rewardSingular: "reward",
  rewardEmoji: "🎁",
  pointsPerReward: 500,
};

export const theme = { colors, spacing, radius, font, minTapTarget, shadow, brand };
export default theme;
