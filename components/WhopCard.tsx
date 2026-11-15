import { StyleSheet, Text, View } from "react-native";
import { colors, font, radius, shadow, spacing, type } from "../constants/theme";

type WhopCardProps = {
  crewName: string;
  balance: number;
  goal: number;
  last4?: string;
  limit?: number;
  sandbox?: boolean;
  testID?: string;
};

const RING_SIZE = 76;
const RING_WIDTH = 7;

export default function WhopCard({ crewName, balance, goal, last4, limit, sandbox = true, testID = "whop-card" }: WhopCardProps) {
  const ready = !!last4 && goal > 0 && balance >= goal;
  const progress = goal > 0 ? Math.min(balance / goal, 1) : 0;

  return (
    <View testID={testID} accessibilityLabel={ready ? `Group card ending in ${last4}` : `Pot funding, ${Math.round(progress * 100)} percent`} style={styles.card}>
      <View style={[styles.blob, styles.blobAccent]} />
      <View style={[styles.blob, styles.blobOrange]} />
      <View style={[styles.blob, styles.blobGold]} />
      <View style={styles.sheen} />

      <View style={styles.topRow}>
        <Text testID={`${testID}-brand`} style={styles.brand}>
          Gojiberri <Text style={styles.brandX}>x</Text> Whop
        </Text>
        {sandbox ? (
          <View testID={`${testID}-sandbox`} style={styles.sandbox}>
            <Text style={styles.sandboxText}>SANDBOX</Text>
          </View>
        ) : null}
      </View>

      {ready ? (
        <View testID={`${testID}-ready`} style={styles.middle}>
          <View style={styles.chip}>
            <View style={styles.chipLine} />
            <View style={styles.chipLine} />
          </View>
          <Text testID={`${testID}-number`} style={styles.number}>
            ••••  ••••  ••••  {last4}
          </Text>
        </View>
      ) : (
        <View testID={`${testID}-funding`} style={styles.fundingRow}>
          <ProgressRing progress={progress} testID={`${testID}-ring`} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fundingLabel}>Funding</Text>
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

function ProgressRing({ progress, testID }: { progress: number; testID: string }) {
  const right = -135 + Math.min(progress, 0.5) * 360;
  const left = 45 + Math.max(progress - 0.5, 0) * 360;
  return (
    <View testID={testID} style={ring.box}>
      <View style={ring.track} />
      <View style={[ring.half, { left: RING_SIZE / 2 }]}>
        <View style={[ring.arc, { left: -RING_SIZE / 2, transform: [{ rotate: `${right}deg` }] }]} />
      </View>
      <View style={[ring.half, { left: 0 }]}>
        <View style={[ring.arc, { left: 0, transform: [{ rotate: `${left}deg` }] }]} />
      </View>
      <Text testID={`${testID}-percent`} style={ring.label}>
        {Math.round(progress * 100)}%
      </Text>
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
  brandX: { color: colors.onInkMuted, fontWeight: font.weight.medium },
  sandbox: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.onInkMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  sandboxText: { color: colors.onInk, fontSize: 10, fontWeight: font.weight.bold, letterSpacing: 1 },
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
});

const ring = StyleSheet.create({
  box: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  track: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_WIDTH,
    borderColor: colors.inkSoft,
  },
  half: { position: "absolute", top: 0, width: RING_SIZE / 2, height: RING_SIZE, overflow: "hidden" },
  arc: {
    position: "absolute",
    top: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_WIDTH,
    borderColor: "transparent",
    borderTopColor: colors.gold,
    borderRightColor: colors.gold,
  },
  label: { color: colors.onInk, fontSize: font.size.md, fontWeight: font.weight.heavy },
});
