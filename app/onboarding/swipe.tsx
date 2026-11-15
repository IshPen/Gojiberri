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
  { id: "t1", category: "nightlife", left: { label: "Frat party", emoji: "🎉" }, right: { label: "Late-night study cafe", emoji: "☕" } },
  { id: "t2", category: "food", left: { label: "$3 taqueria tacos", emoji: "🌮" }, right: { label: "Dining hall ramen bar", emoji: "🍜" } },
  { id: "t3", category: "outdoors", left: { label: "Sunset from the campus hill", emoji: "🌅" }, right: { label: "Beach bonfire with the floor", emoji: "🔥" } },
  { id: "t4", category: "culture", left: { label: "Free student museum night", emoji: "🖼️" }, right: { label: "Campus open mic", emoji: "🎸" } },
  { id: "t5", category: "active", left: { label: "Rec center climbing wall", emoji: "🧗" }, right: { label: "Bike ride with the club", emoji: "🚴" } },
  { id: "t6", category: "food", left: { label: "Dumplings after lecture", emoji: "🥟" }, right: { label: "Sunday pancake brunch", emoji: "🥞" } },
  { id: "t7", category: "vibe", left: { label: "Your floor vs. theirs", emoji: "🏆" }, right: { label: "Chill game night in the lounge", emoji: "🎲" } },
  { id: "t8", category: "sweets", left: { label: "Midnight boba run", emoji: "🧋" }, right: { label: "Bakery day-old deals", emoji: "🥐" } },
  { id: "t9", category: "planning", left: { label: "Text the group chat at 9pm", emoji: "💬" }, right: { label: "Planned around midterms", emoji: "📅" } },
  { id: "t10", category: "drinks", left: { label: "Coffee shop crawl", emoji: "☕" }, right: { label: "Smoothie run after the gym", emoji: "🥤" } },
  { id: "t11", category: "outdoors", left: { label: "Picnic on the quad", emoji: "🧺" }, right: { label: "Kayak rental on student discount", emoji: "🛶" } },
  { id: "t12", category: "entertainment", left: { label: "Improv club show", emoji: "🎤" }, right: { label: "$5 student movie night", emoji: "🎬" } },
  { id: "t13", category: "food", left: { label: "Cheap eats crawl", emoji: "🌯" }, right: { label: "Splurge for someone's birthday", emoji: "🎂" } },
  { id: "t14", category: "culture", left: { label: "Used bookstore wander", emoji: "📚" }, right: { label: "Thrift store haul", emoji: "🛍️" } },
  { id: "t15", category: "vibe", left: { label: "Into the city", emoji: "🌃" }, right: { label: "Stay near campus", emoji: "🌲" } },
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
          message="We lost your profile somewhere between classes. Let's start over."
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
        <Subtitle testID="swipe-subtitle">Tap or swipe toward your pick. We'll find campus spots your crew can afford.</Subtitle>
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
