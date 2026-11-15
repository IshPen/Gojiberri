import { StyleSheet, Text, View } from "react-native";
import { brand, colors, font, radius, spacing } from "../constants/theme";
import { formatPriceLevel } from "../lib/format";
import { Button, Card } from "./ui";

type Props = {
  prompt: string;
  placeName: string;
  area: string;
  priceLevel: number;
  streak: number;
  done: boolean;
  reward?: number;
  onCheckIn: () => void;
};

export default function QuestCard({ prompt, placeName, area, priceLevel, streak, done, reward = 25, onCheckIn }: Props) {
  return (
    <Card testID="quest-card" tone={done ? "success" : "accent"} style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.kicker}>TODAY'S QUEST</Text>
        <Text testID="quest-streak" style={styles.streak}>
          🔥 {streak}
        </Text>
      </View>
      <Text testID="quest-prompt" style={styles.prompt}>
        {prompt}
      </Text>
      <Text testID="quest-place" style={styles.place}>
        📍 {placeName} · {area}
      </Text>
      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Text testID="quest-price" style={styles.metaText}>
            {formatPriceLevel(priceLevel)}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text testID="quest-reward" style={styles.metaText}>
            +{reward} {brand.points} {brand.pointsEmoji}
          </Text>
        </View>
      </View>
      {done ? (
        <View testID="quest-done" style={styles.done}>
          <Text style={styles.doneText}>✅ Quest complete! See you tomorrow.</Text>
        </View>
      ) : (
        <Button testID="quest-checkin" label="Check in with a photo" icon="📸" onPress={onCheckIn} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, borderRadius: radius.xl },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { fontSize: font.size.xs, fontWeight: font.weight.heavy, color: colors.accentDark, letterSpacing: 1 },
  streak: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.accentDark },
  prompt: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text, lineHeight: 30 },
  place: { fontSize: font.size.md, color: colors.textMuted, fontWeight: font.weight.semibold },
  metaRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  meta: { backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  metaText: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.text },
  done: { backgroundColor: colors.card, borderRadius: radius.pill, minHeight: 54, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  doneText: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.success },
});
