import { Stack, useLocalSearchParams, useRouter, type ErrorBoundaryProps } from "expo-router";
import type { GenericId as Id } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import StarRating from "../../components/StarRating";
import { Button, Card, Chip, EmptyState, ErrorState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { api } from "../../convex/_generated/api";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { mockDelay } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const VIBES = ["chill", "chaotic", "cozy", "thrilling", "fancy", "would-redo"];
const HOME_DELAY_MS = 1500;
const LEARNED_WAIT_MS = 2000;
const MAX_LEARNED = 2;
const CLOCK_SKEW_MS = 5000;

// Client-derived learned items until HOME-5 deploys taste.getLastLearned; live mode falls back to them after LEARNED_WAIT_MS.
const LEARNED_MOCK = true;
type LastLearned = { at: number; planId?: Id<"plans">; learned: string[] } | null;
const lastLearnedRef = makeFunctionReference<"query", { userId: Id<"users"> }, LastLearned>("taste:getLastLearned");

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const CATEGORY_WORDS: Record<string, string> = { food: "food spots", bar: "bars", activity: "activities like this", outdoors: "outdoor hangs", arts: "arts nights" };

function deriveLearned(stars: number, vibe: string, place: { category: string; tags: string[] } | null): string[] {
  const direction = stars >= 4 ? "More" : stars <= 2 ? "Less" : null;
  const items: string[] = [];
  if (direction && place) items.push(`${direction} ${place.tags[0]?.replace(/-/g, " ") ?? CATEGORY_WORDS[place.category] ?? "places like this"}`);
  if (vibe === "would-redo") items.push(stars >= 3 ? "More like this" : "Less like this");
  else if (direction) items.push(`${direction} ${vibe} hangs`);
  else if (vibe) items.push(`Noted: ${vibe}`);
  return [...new Set(items)].slice(0, MAX_LEARNED);
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="rate-screen">
      <ErrorState testID="rate-error" message="Couldn't open the rating screen." onRetry={retry} />
    </Screen>
  );
}

export default function RateScreen() {
  const router = useRouter();
  const { userId, loading } = useUserId();
  const { targetId } = useLocalSearchParams<{ targetId: string }>();
  const [stars, setStars] = useState(0);
  const [vibe, setVibe] = useState("");
  const [custom, setCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(0);
  const [waitedOut, setWaitedOut] = useState(LEARNED_MOCK);
  const validPlanId = !!targetId && /^[a-z0-9]{20,40}$/.test(targetId);
  const plan = useQuery(api.plans.getPlan, validPlanId ? { planId: targetId as Id<"plans"> } : "skip");
  const lastLearned = useQuery(lastLearnedRef, !LEARNED_MOCK && userId ? { userId: userId as Id<"users"> } : "skip");
  const liveFresh =
    !!lastLearned && submittedAt > 0 && lastLearned.at >= submittedAt - CLOCK_SKEW_MS && (!lastLearned.planId || lastLearned.planId === targetId);
  const learnedReady = done && (LEARNED_MOCK || liveFresh || waitedOut);

  useEffect(() => {
    if (!done || LEARNED_MOCK) return;
    const timer = setTimeout(() => setWaitedOut(true), LEARNED_WAIT_MS);
    return () => clearTimeout(timer);
  }, [done]);
  const submitLive = useMutation(api.ratings.submitRating);
  const useMock = !!userId?.startsWith("mock_");
  const submitRating = useMock ? () => mockDelay(null, 700) : submitLive;

  useEffect(() => {
    if (!learnedReady) return;
    const timer = setTimeout(() => router.replace("/recommended"), HOME_DELAY_MS);
    return () => clearTimeout(timer);
  }, [learnedReady, router]);

  const chosenVibe = (custom || vibe).trim().toLowerCase();
  const canSubmit = stars > 0 && chosenVibe.length > 0 && !!userId;

  const submit = async () => {
    if (!canSubmit || submitting || !userId) return;
    setSubmitting(true);
    setError(null);
    try {
      setSubmittedAt(Date.now());
      await submitRating({
        userId: userId as Id<"users">,
        planId: targetId as Id<"plans">,
        stars,
        vibe: chosenVibe,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your rating.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!targetId) {
    return (
      <Screen testID="rate-screen">
        <EmptyState
          testID="rate-empty"
          emoji="🤷"
          title="Nothing to rate"
          body="Open this from a finished plan."
          actionLabel="Back home"
          onAction={() => router.replace("/recommended")}
        />
      </Screen>
    );
  }

  if (done) {
    const place = plan ? (plan.places[plan.winningIndex ?? 0] ?? null) : null;
    const learned = !learnedReady
      ? []
      : liveFresh
        ? lastLearned!.learned.slice(0, MAX_LEARNED).map(capitalize)
        : deriveLearned(stars, chosenVibe, place);
    return (
      <Screen testID="rate-screen">
        <Stack.Screen options={{ title: "Rated!", headerBackVisible: false }} />
        <Card testID="rate-success" style={styles.success}>
          <Title testID="rate-confirmation" style={{ textAlign: "center" }}>
            Got it. More like this ↑
          </Title>
          {learned.map((item, i) => (
            <Text key={item} testID={`rate-learned-${i}`} style={styles.learned}>
              {item}
            </Text>
          ))}
          <Button testID="rate-done" label="Back home" onPress={() => router.replace("/recommended")} style={{ alignSelf: "stretch", marginTop: spacing.lg }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen testID="rate-screen">
      <Stack.Screen options={{ title: "Rate it" }} />
      <Title testID="rate-title">How was the hang?</Title>
      <Subtitle testID="rate-subtitle">
        Your rating teaches {brand.name} what your crew loves.
      </Subtitle>

      <Card testID="rate-stars-card" style={{ alignItems: "center", paddingVertical: spacing.xl }}>
        <StarRating value={stars} onChange={setStars} />
        <Text testID="rate-stars-label" style={styles.starsLabel}>
          {stars > 0 ? stars + " / 5" : "Tap a star"}
        </Text>
      </Card>

      <SectionHeader title="Pick a vibe" testID="vibe-header" />
      <View style={styles.chips}>
        {VIBES.map((v) => (
          <Chip
            key={v}
            testID={"vibe-" + v}
            label={v}
            selected={!custom && vibe === v}
            onPress={() => {
              setVibe(v);
              setCustom("");
            }}
          />
        ))}
      </View>
      <TextInput
        testID="vibe-input"
        value={custom}
        onChangeText={(t) => setCustom(t.replace(/\s/g, ""))}
        placeholder="…or type your own one-word vibe"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        style={styles.input}
      />

      {!loading && !userId ? <ErrorState testID="rate-no-user" message="Sign in to rate this." /> : null}
      {error ? <ErrorState testID="rate-error" message={error} onRetry={submit} /> : null}
      <Button testID="rate-submit" label="Submit" onPress={submit} loading={submitting} disabled={!canSubmit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  input: {
    minHeight: minTapTarget + 8,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    fontSize: font.size.md,
    color: colors.text,
  },
  starsLabel: { marginTop: spacing.sm, fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.textMuted },
  success: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxl },
  learned: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.accentDark, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, overflow: "hidden" },
});
