import { Stack, useLocalSearchParams, useRouter, type ErrorBoundaryProps } from "expo-router";
import type { GenericId as Id } from "convex/values";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import StarRating from "../../components/StarRating";
import { Button, Card, Chip, EmptyState, ErrorState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { api } from "../../convex/_generated/api";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { useUserId } from "../../lib/session";

const VIBES = ["chill", "chaotic", "cozy", "thrilling", "fancy", "would-redo"];
const RATE_POINTS = 10;
const HOME_DELAY_MS = 1800;

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
  const submitRating = useMutation(api.ratings.submitRating);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.replace("/home"), HOME_DELAY_MS);
    return () => clearTimeout(timer);
  }, [done, router]);

  const chosenVibe = (custom || vibe).trim().toLowerCase();
  const canSubmit = stars > 0 && chosenVibe.length > 0 && !!userId;

  const submit = async () => {
    if (!canSubmit || submitting || !userId) return;
    setSubmitting(true);
    setError(null);
    try {
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
          onAction={() => router.replace("/home")}
        />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen testID="rate-screen">
        <Stack.Screen options={{ title: "Rated!", headerBackVisible: false }} />
        <Card testID="rate-success" tone="success" style={styles.success}>
          <Text style={styles.bigEmoji}>🎉</Text>
          <Title style={{ textAlign: "center" }}>Thanks for rating!</Title>
          <Text testID="rate-reward" style={styles.reward}>
            +{RATE_POINTS} points
          </Text>
          <Subtitle style={{ textAlign: "center" }}>Your next plans just got smarter. Heading home…</Subtitle>
          <Button testID="rate-done" label="Back home" onPress={() => router.replace("/home")} style={{ alignSelf: "stretch", marginTop: spacing.lg }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen testID="rate-screen">
      <Stack.Screen options={{ title: "Rate it" }} />
      <Title testID="rate-title">How was the hang?</Title>
      <Subtitle testID="rate-subtitle">
        Rating earns +{RATE_POINTS} points and teaches {brand.name} what your crew loves.
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
  bigEmoji: { fontSize: 64 },
  reward: { fontSize: font.size.hero, fontWeight: font.weight.heavy, color: colors.success },
});
