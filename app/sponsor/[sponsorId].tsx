import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import SponsoredBadge from "../../components/SponsoredBadge";
import PointsPill from "../../components/PointsPill";
import { brand, colors, font, spacing } from "../../constants/theme";
import { formatPriceLevel, formatRewards } from "../../lib/format";
import { mockDelay, useMockQuery } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;

type Sponsor = {
  _id: Id<"sponsors">;
  business: string;
  offer: string;
  placeId: Id<"places">;
  priceLevel: number;
  tags: string[];
  rewardCost: number;
  payPerVisit: number;
  active: boolean;
};
type User = { _id: Id<"users">; name: string; points: number; diamonds: number };

// TODO(convex): swap to api.sponsors.listActive once it lands
const listActiveRef = makeFunctionReference<"query", Record<string, never>, Sponsor[]>("sponsors:listActive");
// TODO(convex): swap to api.users.getUser once it lands
const getUserRef = makeFunctionReference<"query", { userId: Id<"users"> }, User | null>("users:getUser");
// TODO(convex): swap to api.sponsors.redeemReward once it lands
const redeemRewardRef = makeFunctionReference<"mutation", { userId: Id<"users">; sponsorId: Id<"sponsors"> }, string>("sponsors:redeemReward");

const MOCK_SPONSORS: Sponsor[] = [
  { _id: "sp1" as Id<"sponsors">, business: "Ritual Coffee Roasters", offer: "Free pastry with any drink", placeId: "pl1" as Id<"places">, priceLevel: 2, tags: ["coffee", "cozy"], rewardCost: 1, payPerVisit: 2.5, active: true },
  { _id: "sp2" as Id<"sponsors">, business: "Smitten Ice Cream", offer: "Buy one scoop, get one free", placeId: "pl2" as Id<"places">, priceLevel: 1, tags: ["dessert"], rewardCost: 1, payPerVisit: 1.5, active: true },
  { _id: "sp3" as Id<"sponsors">, business: "Flour + Water Pizzeria", offer: "15% off your table", placeId: "pl3" as Id<"places">, priceLevel: 3, tags: ["dinner", "date night"], rewardCost: 1, payPerVisit: 6, active: true },
];
const MOCK_USER: User = { _id: "u1" as Id<"users">, name: "Uma", points: 1240, diamonds: 4 };

export default function SponsorScreen() {
  const { sponsorId } = useLocalSearchParams<{ sponsorId: string }>();
  const { userId, loading: sessionLoading } = useUserId();
  const [promo, setPromo] = useState<string | null>(null);
  const [spent, setSpent] = useState(0);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const liveSponsors = useQuery(listActiveRef, USE_MOCK ? "skip" : {});
  const mockSponsors = useMockQuery(MOCK_SPONSORS, USE_MOCK);
  const sponsors = USE_MOCK ? mockSponsors : liveSponsors;

  const liveUser = useQuery(getUserRef, USE_MOCK || !userId ? "skip" : { userId: userId as Id<"users"> });
  const mockUser = useMockQuery(MOCK_USER, USE_MOCK);
  const user = USE_MOCK ? mockUser : liveUser;

  const redeemLive = useMutation(redeemRewardRef);
  const redeem = USE_MOCK
    ? async (args: { userId: Id<"users">; sponsorId: Id<"sponsors"> }) => {
        const s = MOCK_SPONSORS.find((m) => m._id === args.sponsorId);
        if (!s || (user?.diamonds ?? 0) - spent < s.rewardCost) throw new Error("No rewards ready yet.");
        return mockDelay(`GOJI-${s.business.slice(0, 3).toUpperCase()}-7Q2X`, 800);
      }
    : redeemLive;

  if (sessionLoading || sponsors === undefined || user === undefined) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Reward" }} />
        <LoadingState testID="sponsor-loading" />
      </Screen>
    );
  }

  const sponsor = sponsors.find((s) => s._id === sponsorId);
  if (!sponsor) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Reward" }} />
        <EmptyState testID="sponsor-empty" emoji="🔍" title="Offer not found" body="This sponsor offer isn't available anymore." />
      </Screen>
    );
  }
  if (!user) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Reward" }} />
        <ErrorState testID="sponsor-error" message="We couldn't load your account." />
      </Screen>
    );
  }

  const balance = user.diamonds - spent;
  const missing = Math.max(0, sponsor.rewardCost - balance);

  const onRedeem = async () => {
    setRedeeming(true);
    setError(null);
    try {
      const code = await redeem({ userId: (userId ?? user._id) as Id<"users">, sponsorId: sponsor._id });
      setPromo(code);
      setSpent((s) => s + sponsor.rewardCost);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't redeem this reward.");
    } finally {
      setRedeeming(false);
    }
  };

  const onCopy = async () => {
    if (!promo) return;
    await Clipboard.setStringAsync(promo);
    setCopied(true);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: sponsor.business }} />
      <Card testID="sponsor-card" style={styles.offer}>
        <SponsoredBadge />
        <Title testID="sponsor-business">{sponsor.business}</Title>
        <Text testID="sponsor-offer" style={styles.offerText}>
          {sponsor.offer}
        </Text>
        <Text testID="sponsor-price" style={styles.meta}>
          {formatPriceLevel(sponsor.priceLevel)} · {sponsor.tags.join(" · ")}
        </Text>
      </Card>

      <SectionHeader title="Your rewards" />
      <Card testID="sponsor-balance" tone="muted" style={styles.row}>
        <View style={{ gap: spacing.xs }}>
          <Subtitle>Uses</Subtitle>
          <PointsPill testID="sponsor-cost" kind="rewards" size="lg" points={sponsor.rewardCost} />
        </View>
        <View style={{ gap: spacing.xs }}>
          <Subtitle>Ready</Subtitle>
          <PointsPill testID="sponsor-balance-pill" kind="rewards" size="lg" points={balance} />
        </View>
      </Card>

      {promo ? (
        <Card testID="promo-card" tone="success" style={styles.promoCard}>
          <Text style={styles.meta}>Show this code at {sponsor.business}</Text>
          <Text testID="promo-code" selectable style={styles.promo}>
            {promo}
          </Text>
          <Button testID="copy-promo-code" label={copied ? "Copied!" : "Copy code"} variant="secondary" onPress={onCopy} style={{ alignSelf: "stretch" }} />
        </Card>
      ) : (
        <>
          {error ? (
            <Card testID="redeem-error" style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          ) : null}
          <Button
            testID="redeem-button"
            label={missing > 0 ? "No rewards ready yet" : `Redeem (uses ${formatRewards(sponsor.rewardCost)})`}
            onPress={onRedeem}
            loading={redeeming}
            disabled={missing > 0}
          />
          {missing > 0 ? <Subtitle testID="redeem-hint" style={styles.center}>Every {brand.pointsPerReward} {brand.points} unlocks a free reward. Check in on group outings to earn them.</Subtitle> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  offer: { gap: spacing.md },
  offerText: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.accentDark },
  meta: { fontSize: font.size.md, color: colors.textMuted },
  row: { flexDirection: "row", justifyContent: "space-between" },
  promoCard: { alignItems: "center", gap: spacing.md },
  promo: { fontSize: font.size.hero, fontWeight: font.weight.heavy, color: colors.text, letterSpacing: 2, textAlign: "center" },
  errorText: { color: colors.danger, fontSize: font.size.md, fontWeight: font.weight.semibold },
  center: { textAlign: "center" },
});
