import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Button, Card, EmptyState, Screen, Subtitle, Title } from "../../components/ui";
import { colors, font, radius, spacing, type } from "../../constants/theme";
import { formatDay } from "../../lib/format";
import { replyToReview, sameBusiness, useBusinessMock, type MockReview } from "../../lib/businessMock";

export default function ReviewsScreen() {
  const { business } = useLocalSearchParams<{ business?: string }>();
  const all = useBusinessMock((s) => s.reviews);
  const reviews = business ? all.filter((r) => sameBusiness(r.businessName, business)) : [];
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length : 0;

  return (
    <Screen testID="reviews-screen">
      <Stack.Screen options={{ title: "Reviews" }} />
      <View style={{ gap: spacing.xs }}>
        {business ? <Text style={type.eyebrow}>{business}</Text> : null}
        <Title testID="reviews-title">{reviews.length ? `★ ${avg.toFixed(1)}` : "Reviews"}</Title>
        <Subtitle>Ratings from crews after their outing. You get one public reply per review.</Subtitle>
      </View>
      {reviews.length === 0 ? (
        <EmptyState testID="reviews-empty" emoji="⭐" title="No reviews yet" body="After a crew's outing here, their ratings show up on this page." />
      ) : (
        reviews.map((r, i) => <ReviewCard key={r.id} review={r} index={i} />)
      )}
    </Screen>
  );
}

function ReviewCard({ review, index }: { review: MockReview; index: number }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onReply = () => {
    setError(null);
    try {
      replyToReview(review.id, draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post the reply.");
    }
  };

  return (
    <Card testID={`review-${index}`} style={{ gap: spacing.sm }}>
      <View style={styles.head}>
        <Text style={styles.stars}>{"★".repeat(review.stars)}{"☆".repeat(5 - review.stars)}</Text>
        <Text style={type.label}>{formatDay(review.at)}</Text>
      </View>
      <Text testID={`review-${index}-text`} style={type.body}>
        {review.text}
      </Text>
      <Text style={type.muted}>
        {review.student}, {review.crew} · {review.target}
      </Text>
      {review.reply ? (
        <View testID={`review-${index}-reply`} style={styles.reply}>
          <Text style={type.label}>Your reply</Text>
          <Text style={type.body}>{review.reply}</Text>
        </View>
      ) : (
        <>
          <TextInput
            testID={`review-${index}-reply-input`}
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a public reply"
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.input}
          />
          {error ? (
            <Text testID={`review-${index}-reply-error`} style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Button testID={`review-${index}-reply-send`} label="Post reply" variant="ghost" disabled={!draft.trim()} onPress={onReply} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stars: { fontSize: font.size.lg, color: colors.gold, letterSpacing: 2 },
  reply: { backgroundColor: colors.cardMuted, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 64, fontSize: font.size.md, color: colors.text, backgroundColor: colors.background },
  error: { ...type.label, color: colors.danger },
});
