import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Card } from "./ui";
import { colors, font, spacing, type } from "../constants/theme";
import { offerStatus, perkLabel, sameBusiness, useBusinessMock } from "../lib/businessMock";

export default function FollowedDeals() {
  const offers = useBusinessMock((s) => s.offers);
  const deals = useBusinessMock((s) => s.deals);
  const following = useBusinessMock((s) => s.following);
  const shown = [...deals]
    .sort((a, b) => b.sentAt - a.sentAt)
    .filter((d) => following.some((b) => sameBusiness(b, d.businessName)))
    .map((d) => offers.find((o) => o.id === d.offerId))
    .filter((o, i, all) => !!o && offerStatus(o) === "Live" && all.indexOf(o) === i);
  if (shown.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }} testID="followed-deals">
      <Text style={type.heading}>Deals from places you follow</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {shown.map((o, i) => (
          <Card key={o!.id} testID={`followed-deal-${i}`} tone="accent" style={styles.card} onPress={() => router.push(`/offer/${o!.id}`)}>
            <Text style={type.eyebrow} numberOfLines={1}>
              {o!.businessName}
            </Text>
            <Text style={styles.perk}>{perkLabel(o!)}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {o!.title}
            </Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.md, paddingVertical: spacing.xs },
  card: { width: 220, gap: spacing.xs, padding: spacing.lg },
  perk: { ...type.heading, fontSize: font.size.xl, color: colors.accentDark },
  title: { ...type.body, fontWeight: font.weight.bold },
});
