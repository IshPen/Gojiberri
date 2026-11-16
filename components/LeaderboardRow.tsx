import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, emoji, font, radius, spacing } from "../constants/theme";
import { formatPts } from "../lib/school";

export const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = [colors.gold, colors.silver, colors.bronze];
const SPARK_HEIGHT = 18;

export function LeaderboardSparkline({ values, max, mine, testID }: { values: (number | null)[]; max: number; mine?: boolean; testID?: string }) {
  return (
    <View testID={testID} style={styles.spark}>
      {values.map((v, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            v === null
              ? { height: 3, backgroundColor: colors.border }
              : { height: Math.max(3, (v / (max || 1)) * SPARK_HEIGHT), backgroundColor: mine ? colors.accent : colors.leaf },
          ]}
        />
      ))}
    </View>
  );
}

export function LeaderboardAvatar({ glyph, mine, size = 40 }: { glyph: string; mine?: boolean; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, backgroundColor: mine ? colors.accentSoft : colors.cardMuted, borderColor: mine ? colors.accent : colors.border }]}>
      <Text style={{ fontSize: size * 0.36, fontWeight: font.weight.heavy, color: mine ? colors.accentDark : colors.textMuted }}>{glyph}</Text>
    </View>
  );
}

type Props = {
  index: number;
  prefix: "crew" | "school";
  name: string;
  avatar: ReactNode;
  points: number;
  gap: string | null;
  trend: (number | null)[];
  trendMax: number;
  shift?: number;
  mine: boolean;
};

export default function LeaderboardRow({ index, prefix, name, avatar, points, gap, trend, trendMax, shift, mine }: Props) {
  const id = prefix + "-";
  return (
    <View testID={id + "row-" + index} style={[styles.row, mine && styles.rowMine]}>
      <View style={styles.rankCol}>
        {index < 3 ? (
          <View style={[styles.medalDisc, { borderColor: MEDAL_COLORS[index] }]}>
            <Text testID={id + "rank-" + index} style={styles.medal}>
              {MEDALS[index]}
            </Text>
          </View>
        ) : (
          <Text testID={id + "rank-" + index} style={styles.rank}>
            {index + 1}
          </Text>
        )}
        {shift ? (
          <Text testID={id + "rank-" + index + "-delta"} style={[styles.shift, { color: shift > 0 ? colors.success : colors.danger }]}>
            {shift > 0 ? "▲" : "▼"}
            {Math.abs(shift)}
          </Text>
        ) : null}
      </View>
      {avatar}
      <View style={styles.body}>
        <Text testID={id + "name-" + index} numberOfLines={1} style={[styles.name, mine && { color: colors.accentDark }]}>
          {name}
        </Text>
        {gap ? (
          <Text testID={id + "gap-" + index} numberOfLines={1} style={styles.gap}>
            {gap}
          </Text>
        ) : null}
      </View>
      <View style={styles.scoreCol}>
        <Text testID={id + "points-" + index} style={[styles.score, mine && { color: colors.accentDark }]}>
          {formatPts(points)}
        </Text>
        <LeaderboardSparkline values={trend} max={trendMax} mine={mine} testID={id + "trend-" + index} />
      </View>
      {mine ? <View testID={id + "row-mine"} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  rowMine: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  rankCol: { width: 36, alignItems: "center", gap: 2 },
  medalDisc: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  medal: { fontSize: emoji.sm },
  rank: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  shift: { fontSize: font.size.xs, fontWeight: font.weight.heavy },
  avatar: { borderRadius: radius.pill, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 2 },
  name: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.text },
  gap: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted },
  scoreCol: { alignItems: "flex-end", gap: spacing.xs },
  score: { fontSize: font.size.xxl, lineHeight: 30, fontWeight: font.weight.black, color: colors.text, letterSpacing: -0.5, fontVariant: ["tabular-nums"] },
  spark: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: SPARK_HEIGHT },
  bar: { width: 5, borderRadius: 2 },
});
