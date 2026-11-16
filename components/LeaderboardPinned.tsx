import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { brand, colors, font, radius, shadow, spacing } from "../constants/theme";
import { formatPts } from "../lib/school";

type Props = {
  testID: string;
  rank: number | null;
  total: number;
  avatar: ReactNode;
  name: string;
  points: number | null;
  gap: string | null;
  action: ReactNode;
};

export default function LeaderboardPinned({ testID, rank, total, avatar, name, points, gap, action }: Props) {
  const percentile = rank && total >= 3 ? Math.max(1, Math.ceil((rank / total) * 100)) : null;
  return (
    <View testID={testID} style={styles.bar}>
      <View style={styles.top}>
        <Text testID="me-crew-rank" style={styles.rank}>
          {rank ? "#" + rank : "–"}
        </Text>
        {avatar}
        <View style={styles.body}>
          <Text testID="me-crew-name" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          {percentile ? <Text style={styles.percent}>Top {percentile}%</Text> : null}
        </View>
        {points !== null ? (
          <Text style={styles.points}>
            {formatPts(points)}
            <Text style={styles.unit}> {brand.pointsEmoji}</Text>
          </Text>
        ) : null}
      </View>
      {gap ? (
        <Text testID="crews-rivalry-gap" numberOfLines={1} style={styles.gap}>
          {gap}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.card, ...shadow.card },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rank: { fontSize: font.size.xxl, fontWeight: font.weight.black, color: colors.accentDark, minWidth: 44, fontVariant: ["tabular-nums"] },
  body: { flex: 1 },
  name: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.text },
  percent: { fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.success },
  points: { fontSize: font.size.xxl, fontWeight: font.weight.black, color: colors.text, fontVariant: ["tabular-nums"] },
  unit: { fontSize: font.size.md },
  gap: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.accentDark, textAlign: "center" },
});
