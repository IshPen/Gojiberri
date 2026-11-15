import * as Haptics from "expo-haptics";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "./ui";
import SponsoredBadge from "./SponsoredBadge";
import VoteBar from "./VoteBar";
import { colors, font, spacing } from "../constants/theme";
import { formatCostPerPerson } from "../lib/format";

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
};

export default function OptionCard({ index, option, count, total, selected, winner, disabled, onPress }: Props) {
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
      accessibilityLabel={`Vote for ${option.title}`}
    >
      <View style={styles.header}>
        <Text style={styles.number}>{index + 1}</Text>
        <Text testID={`option-title-${index}`} style={styles.title}>
          {winner ? "🏆 " : ""}
          {option.title}
        </Text>
      </View>
      {option.sponsorId ? <SponsoredBadge testID={`sponsored-badge-${index}`} /> : null}
      <Text testID={`option-cost-${index}`} style={styles.cost}>
        {formatCostPerPerson(option.costMin, option.costMax)}
      </Text>
      <Text testID={`option-why-${index}`} style={styles.why}>
        {option.why}
      </Text>
      {option.travel ? (
        <Text testID={`option-travel-${index}`} style={styles.travel}>
          🚇 {option.travel}
        </Text>
      ) : null}
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
  card: { gap: spacing.md, borderWidth: 2 },
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
  title: { flex: 1, fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text },
  cost: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.accentDark },
  why: { fontSize: font.size.md, color: colors.text, lineHeight: 22 },
  travel: { fontSize: font.size.sm, color: colors.textMuted },
  mine: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.accentDark },
});
