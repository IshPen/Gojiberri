import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useAction } from "convex/react";
import { Button, ErrorState, LoadingState, Screen, Subtitle, Title } from "../../components/ui";
import SwipeCard, { type SwipeSide } from "../../components/SwipeCard";
import { colors, font, radius, spacing } from "../../constants/theme";
import { mockDelay } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;

type SwipeArgs = { userId: Id<"users">; chosen: string; rejected: string; category: string };
// TODO(convex): swap to api.memory.rememberSwipe once it lands
const rememberSwipeRef = makeFunctionReference<"action", SwipeArgs, null>("memory:rememberSwipe");

type Option = { label: string; emoji: string };
type Pair = { id: string; category: string; left: Option; right: Option };

// TODO: import { THIS_OR_THAT } from "../../data/thisOrThat" once Gauri's file lands
const THIS_OR_THAT: Pair[] = [
  { id: "t1", category: "nightlife", left: { label: "Rooftop bar", emoji: "🍸" }, right: { label: "Cozy cafe", emoji: "☕" } },
  { id: "t2", category: "food", left: { label: "Tacos in the Mission", emoji: "🌮" }, right: { label: "Ramen in Japantown", emoji: "🍜" } },
  { id: "t3", category: "outdoors", left: { label: "Twin Peaks sunset", emoji: "🌅" }, right: { label: "Ocean Beach bonfire", emoji: "🔥" } },
  { id: "t4", category: "culture", left: { label: "Art museum", emoji: "🖼️" }, right: { label: "Live music", emoji: "🎸" } },
  { id: "t5", category: "active", left: { label: "Hike Lands End", emoji: "🥾" }, right: { label: "Bike the Golden Gate", emoji: "🚴" } },
  { id: "t6", category: "food", left: { label: "Dim sum brunch", emoji: "🥟" }, right: { label: "Pancake brunch", emoji: "🥞" } },
  { id: "t7", category: "vibe", left: { label: "Big loud party", emoji: "🎉" }, right: { label: "Quiet game night", emoji: "🎲" } },
  { id: "t8", category: "sweets", left: { label: "Ice cream run", emoji: "🍦" }, right: { label: "Fresh pastries", emoji: "🥐" } },
  { id: "t9", category: "planning", left: { label: "Spontaneous", emoji: "🎲" }, right: { label: "Planned to the minute", emoji: "📅" } },
  { id: "t10", category: "drinks", left: { label: "Craft beer", emoji: "🍺" }, right: { label: "Natural wine", emoji: "🍷" } },
  { id: "t11", category: "outdoors", left: { label: "Picnic in Dolores", emoji: "🧺" }, right: { label: "Kayak the bay", emoji: "🛶" } },
  { id: "t12", category: "entertainment", left: { label: "Comedy show", emoji: "🎤" }, right: { label: "Indie movie", emoji: "🎬" } },
  { id: "t13", category: "food", left: { label: "Street food crawl", emoji: "🌯" }, right: { label: "Tasting menu", emoji: "🍽️" } },
  { id: "t14", category: "culture", left: { label: "Bookstore wander", emoji: "📚" }, right: { label: "Flea market", emoji: "🛍️" } },
  { id: "t15", category: "vibe", left: { label: "City lights", emoji: "🌃" }, right: { label: "Nature quiet", emoji: "🌲" } },
];

export default function SwipeScreen() {
  const router = useRouter();
  const { userId, loading } = useUserId();
  const [index, setIndex] = useState(0);
  const lastError = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rememberLive = useAction(rememberSwipeRef);
  const rememberSwipe = USE_MOCK ? (args: SwipeArgs) => mockDelay(null, 200) : rememberLive;

  const goNext = () => router.replace("/onboarding/preferences");

  if (loading) return <Screen testID="swipe-screen"><LoadingState testID="swipe-loading" /></Screen>;

  if (!userId) {
    return (
      <Screen testID="swipe-screen">
        <ErrorState
          testID="swipe-no-user"
          message="We couldn't find your profile. Let's start over."
          onRetry={() => router.replace("/onboarding/name")}
        />
      </Screen>
    );
  }

  if (THIS_OR_THAT.length === 0) {
    return (
      <Screen testID="swipe-screen">
        <Button testID="swipe-empty-continue" label="Continue" onPress={goNext} />
      </Screen>
    );
  }

  const pair = THIS_OR_THAT[index];
  const progress = index / THIS_OR_THAT.length;

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
    if (index + 1 >= THIS_OR_THAT.length) goNext();
    else setIndex(index + 1);
  };

  return (
    <Screen
      testID="swipe-screen"
      scroll={false}
      footer={<Button testID="swipe-skip" label="Skip" variant="ghost" onPress={goNext} />}
    >
      <View>
        <Title testID="swipe-title">This or that?</Title>
        <Subtitle testID="swipe-subtitle">Tap or swipe toward your pick. It teaches Gojiberri your taste.</Subtitle>
      </View>
      <View style={styles.progressRow}>
        <View testID="swipe-progress" style={styles.track}>
          <View testID="swipe-progress-fill" style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text testID="swipe-progress-label" style={styles.progressLabel}>
          {index + 1}/{THIS_OR_THAT.length}
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
