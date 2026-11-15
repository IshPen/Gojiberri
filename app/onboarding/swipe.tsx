import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import type { GenericId as Id } from "convex/values";
import { useAction } from "convex/react";
import { Button, ErrorState, LoadingState, Screen, Subtitle, Title } from "../../components/ui";
import SwipeCard, { type SwipeSide } from "../../components/SwipeCard";
import { colors, font, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { THIS_OR_THAT, type ThisOrThatSide } from "../../data/thisOrThat";
import { schoolFor } from "../../lib/school";
import { useUserId } from "../../lib/session";

type Pair = { id: string; category: string; left: ThisOrThatSide; right: ThisOrThatSide };
const PAIRS: Pair[] = THIS_OR_THAT.map((p, i) => ({ id: `t${i + 1}`, category: p.category, left: p.a, right: p.b }));

export default function SwipeScreen() {
  const router = useRouter();
  const { school } = useLocalSearchParams<{ school?: string }>();
  const { userId, loading } = useUserId();
  const [index, setIndex] = useState(0);
  const lastError = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rememberSwipe = useAction(api.memory.rememberSwipe);
  const schoolName = school ? schoolFor(school).name : "your school";

  const goNext = () => router.replace({ pathname: "/onboarding/preferences", params: school ? { school } : {} });

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
  const progress = index / PAIRS.length;

  const onPick = (side: SwipeSide) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const chosen = side === "left" ? pair.left : pair.right;
    const rejected = side === "left" ? pair.right : pair.left;
    Promise.resolve(
      rememberSwipe({ userId: userId as Id<"users">, chosen: chosen.label, rejected: rejected.label, category: pair.category }),
    ).catch((e) => {
      lastError.current = e instanceof Error ? e.message : "Could not save a pick";
      setError(lastError.current);
    });
    if (index + 1 >= PAIRS.length) goNext();
    else setIndex(index + 1);
  };

  return (
    <Screen
      testID="swipe-screen"
      scroll={false}
      footer={<Button testID="swipe-skip" label="Skip" variant="ghost" onPress={goNext} />}
    >
      <View>
        <Title testID="swipe-title">What do {schoolName} students like?</Title>
        <Subtitle testID="swipe-subtitle">This or that? Tap or swipe toward your pick. Your crew's suggestions near {schoolName} learn from every swipe.</Subtitle>
      </View>
      <View style={styles.progressRow}>
        <View testID="swipe-progress" style={styles.track}>
          <View testID="swipe-progress-fill" style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text testID="swipe-progress-label" style={styles.progressLabel}>
          {index + 1}/{PAIRS.length}
        </Text>
      </View>
      {error ? <ErrorState testID="swipe-error" message={error} onRetry={() => setError(null)} /> : null}
      <View style={styles.cardWrap}>
        <SwipeCard key={pair.id} left={pair.left} right={pair.right} onPick={onPick} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  track: { flex: 1, height: 12, borderRadius: radius.pill, backgroundColor: colors.cardMuted, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.accent, borderRadius: radius.pill },
  progressLabel: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.textMuted },
  cardWrap: { flex: 1 },
});
