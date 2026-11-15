import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "./ui";
import VoteBar from "./VoteBar";
import { colors, font, spacing } from "../constants/theme";
import { formatCostPerPerson } from "../lib/format";
import { cleanTitle } from "../lib/format";

export type PlanOption = {
  title: string;
  costMin: number;
  costMax: number;
  why: string;
  travel?: string;
  sponsorId?: string;
};

type Props = {
  index: number;
  option: PlanOption;
  count: number;
  total: number;
  selected: boolean;
  winner: boolean;
  disabled: boolean;
  onPress: () => void;
  extra?: ReactNode;
  footer?: ReactNode;
};

export default function OptionCard({ index, option, count, total, selected, winner, disabled, onPress, extra, footer }: Props) {
  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress();
  };

  return (
    <Card
      testID={`vote-option-${index}`}
      onPress={handlePress}
      disabled={disabled}
      tone={winner ? "success" : selected ? "accent" : "default"}
      style={styles.card}
      accessibilityLabel={`Vote for ${cleanTitle(option.title)}`}
    >
      <View style={styles.header}>
        <Text testID={`option-title-${index}`} style={styles.title} numberOfLines={1}>
          {winner ? "🏆 " : ""}
          {cleanTitle(option.title)}
        </Text>
        {extra}
      </View>
      <Text testID={`option-cost-${index}`} style={styles.cost} numberOfLines={1}>
        {option.sponsorId ? (
          <Text testID={`sponsored-badge-${index}`} style={styles.sponsored}>
            Sponsored ·{" "}
          </Text>
        ) : null}
        {formatCostPerPerson(option.costMin, option.costMax)}
        {option.travel ? <Text testID={`option-travel-${index}`}> · {option.travel}</Text> : null}
      </Text>
      <Text testID={`option-why-${index}`} style={styles.why} numberOfLines={1}>
        {option.why}
      </Text>
      {footer}
      <VoteBar testID={`vote-count-${index}`} count={count} total={total} highlight={selected || winner} />
      {selected ? (
        <Text testID={`my-vote-${index}`} style={styles.mine}>
          ✓ Your vote
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderWidth: 2 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    textAlign: "center",
    lineHeight: 32,
    backgroundColor: colors.accentSoft,
    color: colors.accentDark,
    fontWeight: font.weight.heavy,
  },
  title: { flex: 1, fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  cost: { fontSize: font.size.md, color: colors.textMuted },
  sponsored: { fontWeight: font.weight.bold, color: colors.text },
  why: { fontSize: font.size.md, color: colors.textMuted },
  mine: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.accentDark },
});
