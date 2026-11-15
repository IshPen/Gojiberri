import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import StarRating from "../../components/StarRating";
import { Button, Card, Chip, ErrorState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { formatGojis } from "../../lib/format";
import { mockDelay } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;

type SubmitArgs = { userId: Id<"users">; planId?: Id<"plans">; questId?: Id<"soloQuests">; stars: number; vibe: string };
// TODO(convex): swap to api.ratings.submitRating once it lands
const submitRatingRef = makeFunctionReference<"mutation", SubmitArgs, Id<"ratings">>("ratings:submitRating");

const VIBES = ["fun", "cozy", "thrilling", "chill", "meh", "magical", "loud", "delicious"];

export default function RateScreen() {
  const router = useRouter();
  const { userId } = useUserId();
  const { targetId, type } = useLocalSearchParams<{ targetId: string; type?: string }>();
  const isQuest = type === "quest";
  const [stars, setStars] = useState(0);
  const [vibe, setVibe] = useState("");
  const [custom, setCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submitLive = useMutation(submitRatingRef);
  const submitRating = USE_MOCK ? (_args: SubmitArgs) => mockDelay("mock_rating" as Id<"ratings">, 700) : submitLive;

  const chosenVibe = custom || vibe;
  const canSubmit = stars > 0 && chosenVibe.length > 0;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitRating({
        userId: (userId ?? "mock_uma") as Id<"users">,
        ...(isQuest ? { questId: targetId as Id<"soloQuests"> } : { planId: targetId as Id<"plans"> }),
        stars,
        vibe: chosenVibe.toLowerCase(),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your rating.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Screen testID="rate-screen">
        <Stack.Screen options={{ title: "Rated!", headerBackVisible: false }} />
        <Card testID="rate-success" tone="success" style={styles.success}>
          <Text style={styles.bigEmoji}>🎉</Text>
          <Title style={{ textAlign: "center" }}>Thanks for rating!</Title>
          <Text testID="rate-reward" style={styles.reward}>
            +10 {brand.points} {brand.pointsEmoji}
          </Text>
          <Subtitle style={{ textAlign: "center" }}>You earned {formatGojis(10)} and made your next plans smarter.</Subtitle>
          <Button testID="rate-done" label="Done" onPress={() => router.replace("/home")} style={{ alignSelf: "stretch", marginTop: spacing.lg }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen testID="rate-screen">
      <Stack.Screen options={{ title: "Rate it" }} />
      <Title testID="rate-title">{isQuest ? "How was your quest?" : "How was the plan?"}</Title>
      <Subtitle testID="rate-subtitle">Rating earns +10 {brand.points} and teaches {brand.name} what you love.</Subtitle>

      <Card style={{ alignItems: "center", paddingVertical: spacing.xl }}>
        <StarRating value={stars} onChange={setStars} />
        <Text testID="rate-stars-label" style={styles.starsLabel}>
          {stars > 0 ? `${stars} / 5` : "Tap a star"}
        </Text>
      </Card>

      <SectionHeader title="Pick a vibe" testID="vibe-header" />
      <View style={styles.chips}>
        {VIBES.map((v) => (
          <Chip
            key={v}
            testID={`vibe-${v}`}
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
