import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, spacing } from "../constants/theme";
import { api } from "../convex/_generated/api";
import WhopCard from "./WhopCard";

export default function CrewCardHero({
  groupId,
  crewName,
  planId,
  me,
  testID = "crew-card-hero",
}: {
  groupId: Id<"groups">;
  crewName: string;
  planId?: string | null;
  me: string | null;
  testID?: string;
}) {
  const router = useRouter();
  const pot = useQuery(api.funds.getPot, { groupId });
  const card = useQuery(api.cards.getCard, { groupId });
  const shares = useQuery(api.funds.getPotShares, { groupId });
  const balance = pot?.balance ?? 0;
  const myShare = shares?.find((s) => s.userId === me)?.balance ?? 0;
  const open = () => router.push(planId ? `/pot/${planId}` : `/group/${groupId}`);

  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${crewName} basket`} onPress={open} style={styles.wrap}>
      <WhopCard crewName={crewName} balance={balance} goal={card?.limit ?? balance} last4={card?.card.last4} limit={card?.limit ?? balance} />
      <View style={styles.row}>
        <Text testID={`${testID}-share`} style={styles.stat}>
          You <Text style={styles.value}>${formatDollars(myShare)}</Text>
        </Text>
        <Text testID={`${testID}-balance`} style={styles.stat}>
          🧺 <Text style={styles.value}>${formatDollars(balance)}</Text>
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

function formatDollars(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.xs },
  stat: { fontSize: font.size.md, color: colors.textMuted, fontWeight: font.weight.semibold },
  value: { color: colors.text, fontWeight: font.weight.heavy },
  chevron: { marginLeft: "auto", fontSize: font.size.xl, color: colors.accent, fontWeight: font.weight.bold },
});
