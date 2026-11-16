import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import type { GenericId as Id } from "convex/values";
import { useAction, useConvex } from "convex/react";
import { Button, Card, ErrorState, LoadingState, Screen, Title } from "../../components/ui";
import { colors, emoji, font, radius, spacing, type } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { ONBOARDING_PAIR_INDEXES, THIS_OR_THAT, type ThisOrThatSide } from "../../data/thisOrThat";
import { schoolFor } from "../../lib/school";
import { useUserId } from "../../lib/session";

const REVEAL_MS = 1200;

type Side = "left" | "right";
type Pair = { id: string; category: string; left: ThisOrThatSide; right: ThisOrThatSide };
const PAIRS: Pair[] = ONBOARDING_PAIR_INDEXES.map((i) => THIS_OR_THAT[i]).map((p, i) => ({ id: `t${i + 1}`, category: p.category, left: p.a, right: p.b }));
const SPLIT_PAIRS = PAIRS.map((p) => ({ a: p.left.label, b: p.right.label }));

export default function SwipeScreen() {
  const router = useRouter();
  const { school } = useLocalSearchParams<{ school?: string }>();
  const { userId, loading } = useUserId();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Side | null>(null);
  const lastError = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rememberSwipe = useAction(api.memory.rememberSwipe);
  const convex = useConvex();
  const [splits, setSplits] = useState<{ aPercent: number; bPercent: number }[] | null>(null);

  useEffect(() => {
    if (!school) return;
    let cancelled = false;
    convex
      .query(api.swipeStats.getSchoolSplits, { school: schoolFor(school).name, pairs: SPLIT_PAIRS })
      .then((result) => !cancelled && setSplits(result), () => {});
    return () => {
      cancelled = true;
    };
  }, [convex, school]);
  const schoolName = school ? schoolFor(school).name : "Your school";

  const goNext = useCallback(() => router.replace({ pathname: "/onboarding/preferences", params: school ? { school } : {} }), [router, school]);

  const advance = useCallback(() => {
    setPicked(null);
    if (index + 1 >= PAIRS.length) goNext();
    else setIndex(index + 1);
  }, [index, goNext]);

  useEffect(() => {
    if (!picked) return;
    const timer = setTimeout(advance, REVEAL_MS);
    return () => clearTimeout(timer);
  }, [picked, advance]);

  if (loading) return <Screen testID="swipe-screen"><LoadingState testID="swipe-loading" /></Screen>;

  if (!userId) {
    return (
      <Screen testID="swipe-screen">
        <ErrorState
          testID="swipe-no-user"
          message="We lost your profile somewhere between classes. Let's start over."
          onRetry={() => router.replace("/onboarding/school")}
        />
      </Screen>
    );
  }

  if (PAIRS.length === 0) {
    return (
      <Screen testID="swipe-screen">
        <Button testID="swipe-empty-continue" label="Continue" onPress={goNext} />
      </Screen>
    );
  }

  const pair = PAIRS[index];
  const split = splits?.[index] ?? { aPercent: 50, bPercent: 50 };
  const progress = (index + (picked ? 1 : 0)) / PAIRS.length;

  const onPick = (side: Side) => {
    if (picked) return advance();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const chosen = side === "left" ? pair.left : pair.right;
    const rejected = side === "left" ? pair.right : pair.left;
    Promise.resolve(
      rememberSwipe({ userId: userId as Id<"users">, chosen: chosen.label, rejected: rejected.label, category: pair.category }),
    ).catch((e) => {
      lastError.current = e instanceof Error ? e.message : "Could not save a pick";
      setError(lastError.current);
    });
    setPicked(side);
  };

  return (
    <Screen
      testID="swipe-screen"
      scroll={false}
      footer={<Button testID="swipe-skip" label="Skip" variant="ghost" onPress={goNext} />}
    >
      <View style={styles.progressRow}>
        <View testID="swipe-progress" style={styles.track}>
          <View testID="swipe-progress-fill" style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text testID="swipe-progress-label" style={styles.progressLabel}>
          {index + 1}/{PAIRS.length}
        </Text>
      </View>
      <Title testID="swipe-title" style={styles.center}>
        This or that?
      </Title>
      {error ? (
        <Text testID="swipe-error" style={styles.error} numberOfLines={1} onPress={() => setError(null)}>
          Couldn't save that pick. Keep going.
        </Text>
      ) : null}
      <View style={styles.options} key={pair.id}>
        <Option testID="swipe-option-left" option={pair.left} percent={split.aPercent} picked={picked} side="left" onPress={() => onPick("left")} />
        <Option testID="swipe-option-right" option={pair.right} percent={split.bPercent} picked={picked} side="right" onPress={() => onPick("right")} />
      </View>
      <Text testID="swipe-split" style={[styles.split, !picked && styles.hidden]}>
        {schoolName}: {split.aPercent}% chose {pair.left.label} · {split.bPercent}% {pair.right.label}
      </Text>
    </Screen>
  );
}

function Option({
  testID,
  option,
  percent,
  picked,
  side,
  onPress,
}: {
  testID: string;
  option: ThisOrThatSide;
  percent: number;
  picked: Side | null;
  side: Side;
  onPress: () => void;
}) {
  const mine = picked === side;
  return (
    <Card testID={testID} tone={mine ? "accent" : "default"} accessibilityLabel={option.label} onPress={onPress} style={[styles.option, picked && !mine && styles.faded]}>
      <Text testID={`${testID}-emoji`} style={styles.emoji}>
        {option.emoji}
      </Text>
      <Text testID={`${testID}-label`} style={styles.label}>
        {option.label}
      </Text>
      {picked ? (
        <View style={styles.result}>
          <View style={styles.barTrack}>
            <View testID={`${testID}-bar`} style={[styles.barFill, { width: `${percent}%`, backgroundColor: mine ? colors.accent : colors.textMuted }]} />
          </View>
          <Text testID={`${testID}-percent`} style={[styles.percent, mine && { color: colors.accentDark }]}>
            {percent}%
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  track: { flex: 1, height: 12, borderRadius: radius.pill, backgroundColor: colors.cardMuted, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.accent, borderRadius: radius.pill },
  progressLabel: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.textMuted },
  center: { textAlign: "center" },
  options: { flex: 1, gap: spacing.lg },
  option: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  faded: { opacity: 0.7 },
  emoji: { fontSize: emoji.xl },
  label: { ...type.heading, fontSize: font.size.xl, textAlign: "center" },
  result: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: spacing.md },
  barTrack: { flex: 1, height: 14, borderRadius: radius.pill, backgroundColor: colors.cardMuted, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radius.pill },
  percent: { ...type.heading, minWidth: 48, textAlign: "right", color: colors.textMuted },
  split: { ...type.label, textAlign: "center" },
  hidden: { opacity: 0 },
  error: { ...type.label, color: colors.danger, textAlign: "center" },
});
