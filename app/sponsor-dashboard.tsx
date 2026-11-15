import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useAction, useQuery } from "convex/react";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../components/ui";
import { brand, colors, font, spacing } from "../constants/theme";
import { mockDelay, useMockQuery } from "../lib/mock";

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
type Stats = { visits: number; earned: number };

// TODO(convex): swap to api.sponsors.listActive once it lands
const listActiveRef = makeFunctionReference<"query", Record<string, never>, Sponsor[]>("sponsors:listActive");
// TODO(convex): swap to api.sponsors.stats once it lands
const statsRef = makeFunctionReference<"query", { sponsorId: Id<"sponsors"> }, Stats>("sponsors:stats");
// TODO(convex): swap to api.whop.createSponsorCheckout once it lands
const checkoutRef = makeFunctionReference<"action", { sponsorId: Id<"sponsors"> }, string>("whop:createSponsorCheckout");

const MOCK_SPONSORS: Sponsor[] = [
  { _id: "sp1" as Id<"sponsors">, business: "Ritual Coffee Roasters", offer: "Free pastry with any drink", placeId: "pl1" as Id<"places">, priceLevel: 2, tags: ["coffee"], rewardCost: 1, payPerVisit: 2.5, active: true },
  { _id: "sp2" as Id<"sponsors">, business: "Smitten Ice Cream", offer: "Buy one scoop, get one free", placeId: "pl2" as Id<"places">, priceLevel: 1, tags: ["dessert"], rewardCost: 1, payPerVisit: 1.5, active: true },
  { _id: "sp3" as Id<"sponsors">, business: "Flour + Water Pizzeria", offer: "15% off your table", placeId: "pl3" as Id<"places">, priceLevel: 3, tags: ["dinner"], rewardCost: 1, payPerVisit: 6, active: true },
];
const MOCK_STATS: Record<string, Stats> = {
  sp1: { visits: 42, earned: 105 },
  sp2: { visits: 27, earned: 40.5 },
  sp3: { visits: 18, earned: 108 },
};

export default function SponsorDashboardScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveSponsors = useQuery(listActiveRef, USE_MOCK ? "skip" : {});
  const mockSponsors = useMockQuery(MOCK_SPONSORS, USE_MOCK);
  const sponsors = USE_MOCK ? mockSponsors : liveSponsors;

  const activeId = selectedId ?? sponsors?.[0]?._id ?? null;
  const liveStats = useQuery(statsRef, USE_MOCK || !activeId ? "skip" : { sponsorId: activeId as Id<"sponsors"> });
  const mockStats = useMockQuery(MOCK_STATS[activeId ?? ""] ?? { visits: 0, earned: 0 }, USE_MOCK && !!activeId, 400);
  const stats = USE_MOCK ? mockStats : liveStats;

  const checkoutLive = useAction(checkoutRef);
  const createCheckout = USE_MOCK ? (_args: { sponsorId: Id<"sponsors"> }) => mockDelay("https://whop.com/checkout/gojiberri-demo", 700) : checkoutLive;

  const fund = async () => {
    if (!activeId) return;
    setFunding(true);
    setError(null);
    try {
      const url = await createCheckout({ sponsorId: activeId as Id<"sponsors"> });
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open checkout.");
    } finally {
      setFunding(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Sponsor dashboard" }} />
      <Title testID="dashboard-title">Business dashboard</Title>
      <Subtitle>See how your {brand.name} sponsorship is bringing people through the door.</Subtitle>

      {sponsors === undefined ? (
        <LoadingState testID="dashboard-loading" />
      ) : sponsors.length === 0 ? (
        <EmptyState testID="dashboard-empty" emoji="🏪" title="No sponsors yet" body="Active sponsors will show up here." />
      ) : (
        <>
          <View style={styles.chips}>
            {sponsors.map((s, i) => (
              <Chip key={s._id} testID={`sponsor-chip-${i}`} label={s.business} selected={s._id === activeId} onPress={() => setSelectedId(s._id)} />
            ))}
          </View>

          <SectionHeader title="This month" />
          {stats === undefined ? (
            <LoadingState testID="stats-loading" />
          ) : (
            <>
              <Card testID="stat-visits-card" tone="accent" style={styles.stat}>
                <Text style={styles.statLabel}>Verified visits</Text>
                <Text testID="stat-visits" style={styles.statValue}>
                  {stats.visits}
                </Text>
              </Card>
              <Card testID="stat-earned-card" tone="success" style={styles.stat}>
                <Text style={styles.statLabel}>Spent on visits</Text>
                <Text testID="stat-earned" style={styles.statValue}>
                  ${stats.earned.toFixed(2)}
                </Text>
              </Card>
            </>
          )}

          {error ? <ErrorState testID="fund-error" message={error} onRetry={fund} /> : null}
          <Button testID="fund-quests" label="Fund more quests" icon="💸" onPress={fund} loading={funding} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: { alignItems: "center", gap: spacing.xs },
  statLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.textMuted },
  statValue: { fontSize: 56, fontWeight: font.weight.heavy, color: colors.text },
});
