import { StyleSheet, Text, View } from "react-native";
import { Button } from "./ui";
import Basket from "./Basket";
import { colors, font, radius, shadow, spacing, type } from "../constants/theme";

type WhopCardProps = {
  crewName: string;
  balance: number;
  goal: number;
  last4?: string;
  limit?: number;
  spent?: number;
  showNumber?: boolean;
  testID?: string;
};


export default function WhopCard({ crewName, balance, goal, last4, limit, spent, showNumber, testID = "whop-card" }: WhopCardProps) {
  const ready = !!last4 && (!!showNumber || spent !== undefined || (goal > 0 && balance >= goal));
  const progress = goal > 0 ? Math.min(balance / goal, 1) : 0;

  return (
    <View testID={testID} accessibilityLabel={ready ? `Group card ending in ${last4}` : `Basket ${Math.round(progress * 100)} percent full`} style={styles.card}>
      <View style={[styles.blob, styles.blobAccent]} />
      <View style={[styles.blob, styles.blobOrange]} />
      <View style={[styles.blob, styles.blobGold]} />
      <View style={styles.sheen} />

      <View style={styles.topRow}>
        <Text testID={`${testID}-brand`} style={styles.brand}>
          Gojiberri
        </Text>
        <Text testID={`${testID}-powered`} style={styles.powered}>
          powered by <Text style={styles.poweredWhop}>Whop</Text>
        </Text>
      </View>

      {ready ? (
        <View testID={`${testID}-ready`} style={styles.middle}>
          <View style={styles.chip}>
            <View style={styles.chipLine} />
            <View style={styles.chipLine} />
          </View>
          <View style={{ flex: 1 }}>
            <Text testID={`${testID}-number`} style={styles.number}>
              ••••  ••••  ••••  {last4}
            </Text>
            {spent !== undefined ? (
              <Text testID={`${testID}-paid`} style={styles.fundingLabel}>
                Paid ✓ ${formatDollars(spent)} spent
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <View testID={`${testID}-funding`} style={styles.fundingRow}>
          <Basket progress={progress} size={76} testID={`${testID}-ring`} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fundingLabel}>Berries in the basket</Text>
            <Text testID={`${testID}-funding-amount`} style={styles.fundingAmount}>
              ${formatDollars(balance)} <Text style={styles.fundingGoal}>/ ${formatDollars(goal)}</Text>
            </Text>
          </View>
        </View>
      )}

      <View style={styles.bottomRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.caption}>CREW</Text>
          <Text testID={`${testID}-crew`} style={styles.crew} numberOfLines={1}>
            {crewName}
          </Text>
        </View>
        <View testID={`${testID}-limit`} style={styles.limitChip}>
          <Text style={styles.limitText}>spend limit ${formatDollars(limit ?? balance)}</Text>
        </View>
      </View>
    </View>
  );
}

export function LockedWhopCard({ onStart, testID = "whop-locked" }: { onStart: () => void; testID?: string }) {
  return (
    <View testID={testID} style={styles.lockedWrap}>
      <View accessibilityLabel="Whop crew card, locked" style={[styles.card, styles.lockedCard]}>
        <View style={styles.topRow}>
          <Text style={styles.brand}>
            Gojiberri <Text style={styles.lockedX}>x</Text> Whop
          </Text>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>
        <View style={[styles.chip, styles.lockedChip]} />
        <Text style={styles.lockedText}>Start a crew to unlock Whop</Text>
      </View>
      <Button testID="whop-locked-start-crew" label="Start a crew" onPress={onStart} />
    </View>
  );
}

function formatDollars(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1.586,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    padding: spacing.xl,
    overflow: "hidden",
    justifyContent: "space-between",
    ...shadow.ink,
  },
  blob: { position: "absolute", borderRadius: 999 },
  blobAccent: { width: 320, height: 320, top: -170, right: -110, backgroundColor: colors.accent, opacity: 0.85 },
  blobOrange: { width: 240, height: 240, bottom: -150, left: -70, backgroundColor: colors.partner, opacity: 0.5 },
  blobGold: { width: 140, height: 140, bottom: -60, right: -30, backgroundColor: colors.gold, opacity: 0.18 },
  sheen: {
    position: "absolute",
    width: 600,
    height: 70,
    top: 60,
    left: -100,
    backgroundColor: "rgba(255,255,255,0.07)",
    transform: [{ rotate: "-18deg" }],
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: colors.onInk, fontSize: font.size.md, fontWeight: font.weight.heavy, letterSpacing: 0.4 },
  powered: { color: colors.onInkMuted, fontSize: font.size.xs, fontWeight: font.weight.semibold },
  poweredWhop: { color: colors.onInk, fontWeight: font.weight.heavy },
  middle: { gap: spacing.md },
  chip: {
    width: 42,
    height: 30,
    borderRadius: 6,
    backgroundColor: colors.gold,
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
  },
  chipLine: { height: 1.5, backgroundColor: "rgba(0,0,0,0.25)" },
  number: { color: colors.onInk, fontSize: font.size.xl, fontWeight: font.weight.bold, letterSpacing: 1.5, fontVariant: ["tabular-nums"] },
  fundingRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  fundingLabel: { ...type.label, color: colors.onInkMuted },
  fundingAmount: { ...type.title, color: colors.onInk },
  fundingGoal: { color: colors.onInkMuted, fontSize: font.size.lg, fontWeight: font.weight.semibold },
  bottomRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  caption: { color: colors.onInkMuted, fontSize: 10, fontWeight: font.weight.bold, letterSpacing: 1.2 },
  crew: { color: colors.onInk, fontSize: font.size.md, fontWeight: font.weight.bold },
  limitChip: {
    backgroundColor: colors.inkSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  limitText: { color: colors.onInk, fontSize: font.size.xs, fontWeight: font.weight.bold },
  lockedWrap: { gap: spacing.md },
  lockedCard: { backgroundColor: "#9A9499", shadowOpacity: 0, elevation: 0 },
  lockedX: { color: colors.onInkMuted, fontWeight: font.weight.medium },
  lockIcon: { fontSize: font.size.lg },
  lockedChip: { backgroundColor: "rgba(255,255,255,0.35)" },
  lockedText: { color: colors.onInk, fontSize: font.size.lg, fontWeight: font.weight.bold },
});

