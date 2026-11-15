import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { router, type ErrorBoundaryProps } from "expo-router";
import { useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import SponsoredBadge from "../../components/SponsoredBadge";
import { Card, Chip, EmptyState, ErrorState, LoadingState, Screen, Subtitle, Title } from "../../components/ui";
import { colors, font, radius, spacing, emoji as emojiSize } from "../../constants/theme";
import { DEFAULT_SCHOOL, experienceEmoji, groupSize, SCHOOL_AREAS } from "../../lib/experiences";
import { useUserId } from "../../lib/session";

type ExperienceRow = {
  _id: Id<"experiences">;
  title: string;
  pricePerPerson: number;
  minGroup: number;
  maxGroup: number;
  tags: string[];
  imageUrl: string | null;
  businessName: string;
  area: string | null;
  category: string | null;
  partner: boolean;
};

const listForSaleRef = makeFunctionReference<"query", Record<string, never>, ExperienceRow[]>("experienceShop:listForSale");
const getUserRef = makeFunctionReference<"query", { userId: Id<"users"> }, { homeArea: string } | null>("users:getUser");

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="experiences-screen">
      <ErrorState testID="experiences-error" message={error.message} onRetry={retry} />
    </Screen>
  );
}

export default function ExperiencesScreen() {
  const { userId } = useUserId();
  const user = useQuery(getUserRef, userId ? { userId: userId as Id<"users"> } : "skip");
  const experiences = useQuery(listForSaleRef, {});
  const [nearOnly, setNearOnly] = useState(true);
  const [category, setCategory] = useState<string | null>(null);

  const school = user?.homeArea && SCHOOL_AREAS[user.homeArea] ? user.homeArea : DEFAULT_SCHOOL;
  const areas = SCHOOL_AREAS[school];
  const nearby = useMemo(
    () => (experiences ?? []).filter((e) => !nearOnly || (e.area !== null && areas.includes(e.area))),
    [experiences, nearOnly, areas],
  );
  const categories = useMemo(
    () => [...new Set(nearby.map((e) => e.category).filter((c): c is string => !!c))].sort(),
    [nearby],
  );
  const shown = category ? nearby.filter((e) => e.category === category) : nearby;

  return (
    <Screen testID="experiences-screen">
      <Title testID="experiences-title">Buy experiences</Title>
      <Subtitle testID="experiences-subtitle">
        {nearOnly ? `Packages from local businesses near ${school}` : "Packages from every local business"}
      </Subtitle>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} testID="experiences-filters">
        <Chip
          testID="experiences-filter-near"
          label={`📍 Near ${school}`}
          selected={nearOnly}
          onPress={() => {
            setNearOnly(true);
            setCategory(null);
          }}
        />
        <Chip
          testID="experiences-filter-everywhere"
          label="🌎 Everywhere"
          selected={!nearOnly}
          onPress={() => {
            setNearOnly(false);
            setCategory(null);
          }}
        />
        {categories.map((c) => (
          <Chip
            key={c}
            testID={`experiences-category-${c}`}
            label={`${experienceEmoji(c)} ${c}`}
            selected={category === c}
            onPress={() => setCategory(category === c ? null : c)}
          />
        ))}
      </ScrollView>

      {experiences === undefined ? (
        <LoadingState testID="experiences-loading" label="Finding experiences…" />
      ) : experiences.length === 0 ? (
        <EmptyState
          testID="experiences-empty"
          emoji="🧋"
          title="No experiences for sale yet"
          body="Local businesses haven't listed any packages. Check back soon."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          testID="experiences-empty-nearby"
          emoji="📍"
          title={nearOnly ? `Nothing near ${school} yet` : "Nothing in this category"}
          body={nearOnly ? `No business in ${areas.join(", ")} is selling right now.` : "Try another category."}
          actionLabel={nearOnly ? "Show everywhere" : "Show all categories"}
          actionTestID="experiences-empty-action"
          onAction={() => (nearOnly ? setNearOnly(false) : setCategory(null))}
        />
      ) : (
        <View style={styles.list} testID="experiences-list">
          {shown.map((e) => (
            <Card
              key={e._id}
              testID={`experience-card-${e._id}`}
              tone={e.partner ? "accent" : "default"}
              accessibilityLabel={`${e.title} from ${e.businessName}`}
              onPress={() => router.push(`/experience/${e._id}`)}
            >
              <View style={styles.row}>
                {e.imageUrl ? (
                  <Image source={{ uri: e.imageUrl }} style={styles.photo} testID={`experience-photo-${e._id}`} />
                ) : (
                  <View style={[styles.photo, styles.emojiBox]} testID={`experience-emoji-${e._id}`}>
                    <Text style={styles.emoji}>{experienceEmoji(e.category)}</Text>
                  </View>
                )}
                <View style={styles.body}>
                  {e.partner ? <SponsoredBadge testID={`experience-sponsored-${e._id}`} /> : null}
                  <Text style={styles.business} numberOfLines={1} testID={`experience-business-${e._id}`}>
                    {e.businessName}
                    {e.area ? ` · ${e.area}` : ""}
                  </Text>
                  <Text style={styles.title} numberOfLines={2} testID={`experience-title-${e._id}`}>
                    {e.title}
                  </Text>
                  <Text style={styles.meta} testID={`experience-price-${e._id}`}>
                    ${e.pricePerPerson} per person · {groupSize(e.minGroup, e.maxGroup)}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.sm, paddingVertical: spacing.md },
  list: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  photo: { width: 72, height: 72, borderRadius: radius.md },
  emojiBox: { backgroundColor: colors.cardMuted, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: emojiSize.md },
  body: { flex: 1, gap: spacing.xs },
  business: { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.textMuted },
  title: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  meta: { fontSize: font.size.sm, color: colors.text },
});
