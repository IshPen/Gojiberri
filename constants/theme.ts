export const colors = {
  accent: "#6A2C9E",
  accentDark: "#4A1C73",
  accentSoft: "#F1E7FA",
  berry: "#D62E4A",
  berryDark: "#A3193A",
  berrySoft: "#FCE6E8",
  background: "#FFF8EF",
  card: "#FFFFFF",
  cardMuted: "#F9EFE4",
  text: "#2B1A17",
  textMuted: "#7E6A62",
  textOnAccent: "#FFFFFF",
  border: "#F1E2D4",
  leaf: "#3F8F5B",
  leafSoft: "#E4F3E7",
  success: "#3F8F5B",
  successSoft: "#E4F3E7",
  warning: "#E59A2F",
  warningSoft: "#FCF0DA",
  danger: "#CC2E2A",
  dangerSoft: "#FBE3E0",
  gold: "#F2B630",
  silver: "#B9B4B0",
  bronze: "#D08A4E",
  ink: "#2A1240",
  inkSoft: "rgba(255, 255, 255, 0.16)",
  onInk: "#FFFFFF",
  onInkMuted: "rgba(255, 255, 255, 0.62)",
  partner: "#FF6243",
  overlay: "rgba(43, 26, 23, 0.45)",
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
    black: "900" as const,
  },
};

export const type = {
  display: { fontSize: font.size.hero, lineHeight: 42, fontWeight: font.weight.heavy, letterSpacing: -0.8, color: colors.text },
  title: { fontSize: font.size.xxl, lineHeight: 34, fontWeight: font.weight.bold, letterSpacing: -0.5, color: colors.text },
  heading: { fontSize: font.size.lg, lineHeight: 24, fontWeight: font.weight.bold, letterSpacing: -0.2, color: colors.text },
  body: { fontSize: font.size.md, lineHeight: 22, fontWeight: font.weight.regular, color: colors.text },
  muted: { fontSize: font.size.md, lineHeight: 22, fontWeight: font.weight.regular, color: colors.textMuted },
  label: { fontSize: font.size.sm, lineHeight: 18, fontWeight: font.weight.semibold, color: colors.textMuted },
  eyebrow: { fontSize: font.size.xs, lineHeight: 16, fontWeight: font.weight.heavy, letterSpacing: 1.2, textTransform: "uppercase" as const, color: colors.accentDark },
};

export const emoji = { sm: 20, md: 28, lg: 44, xl: 64 };

export const minTapTarget = 44;

export const shadow = {
  sm: {
    shadowColor: "#7A2A2A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  card: {
    shadowColor: "#7A2A2A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  lift: {
    shadowColor: colors.accentDark,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  ink: {
    shadowColor: colors.ink,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
};

export const motion = {
  pressScale: 0.985,
  fast: 150,
  base: 250,
  slow: 400,
  countUp: 900,
  confettiColors: [colors.berry, colors.berryDark, "#FF8FA3", colors.gold, colors.leaf, colors.accent],
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

export const theme = { colors, spacing, radius, font, type, emoji, minTapTarget, shadow, motion, brand };
export default theme;
