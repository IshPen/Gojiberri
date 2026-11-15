import { useEffect, useState } from "react";
import { AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, type ErrorBoundaryProps } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAction, useQuery } from "convex/react";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../components/ui";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { brand, colors, emoji, font, radius, shadow, spacing, type } from "../constants/theme";
import { formatTime } from "../lib/format";

const KIND_LABELS = { offer: "Offer", reward: "Goji reward", experience: "Experience" } as const;

const money = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function useStartOfToday() {
  const [since, setSince] = useState(startOfToday);
  useEffect(() => {
    const refresh = () => setSince(startOfToday());
    const nextMidnight = startOfToday() + 24 * 60 * 60 * 1000;
    const timer = setTimeout(refresh, Math.max(1000, nextMidnight - Date.now() + 1000));
    const sub = AppState.addEventListener("change", (state) => state === "active" && refresh());
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [since]);
  return since;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="dashboard-screen">
      <Stack.Screen options={{ title: "Business" }} />
      <ErrorState testID="dashboard-error" message={error.message || "Couldn't load your business."} onRetry={retry} />
    </Screen>
  );
}

export default function SponsorDashboardScreen() {
  const router = useRouter();
  const accounts = useQuery(api.businessDashboard.listAccounts);
  const [selected, setSelected] = useState<number>(0);
  const since = useStartOfToday();
  const account = accounts?.[selected] ?? accounts?.[0] ?? null;
  const home = useQuery(
    api.businessDashboard.getHome,
    account ? { sponsorId: account.sponsorId ?? undefined, businessId: account.businessId ?? undefined, since } : "skip",
  );

  const createCheckout = useAction(api.whop.createSponsorCheckout);
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);

  const fund = async (sponsorId: Id<"sponsors">) => {
    setFunding(true);
    setFundError(null);
    try {
      await WebBrowser.openBrowserAsync(await createCheckout({ sponsorId }));
    } catch (e) {
      setFundError(e instanceof Error ? e.message : "Couldn't open checkout.");
    } finally {
      setFunding(false);
    }
  };

  const header = <Stack.Screen options={{ title: "Business" }} />;

  if (accounts === undefined) {
    return (
      <Screen testID="dashboard-screen">
        {header}
        <LoadingState testID="dashboard-loading" />
      </Screen>
    );
  }
  if (!account) {
    return (
      <Screen testID="dashboard-screen">
        {header}
        <EmptyState testID="dashboard-empty" emoji="🏪" title="No businesses yet" body="Sponsors and experience businesses show up here once they're seeded." />
      </Screen>
    );
  }

  const scanId = (account.sponsorActive ? account.sponsorId : account.businessId) ?? account.sponsorId ?? account.businessId;
  const alsoId = scanId === account.sponsorId ? account.businessId : account.sponsorId;

  return (
    <Screen testID="dashboard-screen">
      {header}
      <View style={{ gap: spacing.xs }}>
        <Text style={type.eyebrow}>Business home</Text>
        <Title testID="dashboard-title">{account.name}</Title>
        <Subtitle>Stanford crews redeeming, booking and chipping in with {brand.name}.</Subtitle>
      </View>

      {accounts.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} testID="sponsor-chips">
          {accounts.map((a, i) => (
            <Chip key={a.name} testID={`sponsor-chip-${i}`} label={a.name} selected={a.name === account.name} onPress={() => setSelected(i)} />
          ))}
        </ScrollView>
      ) : null}

      <View testID="scan-hero" style={styles.hero}>
        <Text style={styles.heroEyebrow}>Today</Text>
        <Text testID="stat-today" style={styles.heroValue}>
          {home ? home.today.count : "–"}
        </Text>
        <Text style={styles.heroLabel}>{home?.today.count === 1 ? "code redeemed" : "codes redeemed"}</Text>
        <Button
          testID="scan-qr-button"
          label="Scan QR"
          icon="📷"
          onPress={() => router.push({ pathname: "/business/scan", params: alsoId ? { businessId: scanId!, alsoId } : { businessId: scanId! } })}
          style={styles.heroButton}
        />
      </View>

      {home === undefined ? (
        <LoadingState testID="stats-loading" />
      ) : home === null ? (
        <EmptyState testID="dashboard-missing" emoji="🔍" title="Business not found" body="This business was removed. Pick another one above." />
      ) : (
        <>
          <SectionHeader title="Today's redemptions" testID="today-header" />
          {home.today.recent.length === 0 ? (
            <EmptyState testID="today-empty" emoji="🎟️" title="No scans yet today" body="When a student shows their QR, tap Scan QR and it lands here." />
          ) : (
            home.today.recent.map((r, i) => (
              <Card key={r.redemptionId} testID={`today-redemption-${i}`} style={styles.row}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {r.itemTitle}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {KIND_LABELS[r.kind]} · {r.studentName}
                  </Text>
                </View>
                <Text style={styles.rowMeta}>{formatTime(r.redeemedAt)}</Text>
              </Card>
            ))
          )}

          <SectionHeader title="Offers and sponsorship" testID="offers-header" />
          {home.sponsorship ? (
            <>
              <Card testID="offer-card" style={{ gap: spacing.sm }}>
                <View style={[styles.pill, home.sponsorship.active ? styles.pillLive : styles.pillPaused]}>
                  <Text testID="offer-status" style={styles.pillText}>
                    {home.sponsorship.active ? "Live" : "Paused"}
                  </Text>
                </View>
                <Text testID="offer-text" style={styles.offerText}>
                  {home.sponsorship.offer}
                </Text>
                <Text style={styles.rowMeta}>Goji reward costs {home.sponsorship.rewardCost} {home.sponsorship.rewardCost === 1 ? brand.rewardSingular : brand.rewards}</Text>
              </Card>
              <Card testID="stat-chipins-card" tone="accent" style={{ gap: spacing.xs }}>
                <Text style={styles.statLabel}>Crew pot chip-ins</Text>
                <Text testID="stat-chipins" style={styles.statLine}>
                  Chipped into {home.sponsorship.chipIns.pots} crew {home.sponsorship.chipIns.pots === 1 ? "pot" : "pots"}: {money(home.sponsorship.chipIns.total)}
                </Text>
              </Card>
              <View style={styles.statRow}>
                <Card testID="stat-visits-card" tone="muted" style={styles.stat}>
                  <Text testID="stat-visits" style={styles.statValue}>
                    {home.sponsorship.visits}
                  </Text>
                  <Text style={styles.statLabel}>Verified visits</Text>
                </Card>
                <Card testID="stat-earned-card" tone="muted" style={styles.stat}>
                  <Text testID="stat-earned" style={styles.statValue}>
                    {money(home.sponsorship.spentOnVisits)}
                  </Text>
                  <Text style={styles.statLabel}>Spent on visits</Text>
                </Card>
              </View>
              {fundError ? <ErrorState testID="fund-error" message={fundError} onRetry={() => fund(home.sponsorship!.sponsorId)} /> : null}
              <Button testID="fund-quests" label="Fund more quests" icon="💸" variant="secondary" onPress={() => fund(home.sponsorship!.sponsorId)} loading={funding} />
            </>
          ) : (
            <Card testID="offers-empty" tone="muted">
              <Text style={styles.rowMeta}>No sponsor offer yet. Sponsoring puts you in crews' plans and chips into their pots.</Text>
            </Card>
          )}

          <SectionHeader title="Experiences" testID="experiences-header" />
          {home.sales ? (
            <>
              <View style={styles.statRow}>
                <Card testID="stat-sold-card" tone="success" style={styles.stat}>
                  <Text testID="stat-sold" style={styles.statValue}>
                    {home.sales.sold}
                  </Text>
                  <Text style={styles.statLabel}>Bookings</Text>
                </Card>
                <Card testID="stat-sales-earned-card" tone="success" style={styles.stat}>
                  <Text testID="stat-sales-earned" style={styles.statValue}>
                    {money(home.sales.earned)}
                  </Text>
                  <Text style={styles.statLabel}>Earned</Text>
                </Card>
              </View>
              {home.sales.experiences.length === 0 ? (
                <EmptyState testID="experiences-empty" emoji="🎟️" title="No experiences listed" body="Listed experiences and their bookings show up here." />
              ) : (
                home.sales.experiences.map((e, i) => (
                  <Card key={e.experienceId} testID={`experience-row-${i}`} style={styles.row}>
                    <View style={{ flex: 1, gap: spacing.xs }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {e.title}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {money(e.pricePerPerson)} per person{e.active ? "" : " · Paused"}
                      </Text>
                    </View>
                    <Text testID={`experience-sold-${i}`} style={styles.rowStrong}>
                      {e.sold} sold
                    </Text>
                  </Card>
                ))
              )}
            </>
          ) : (
            <Card testID="experiences-none" tone="muted">
              <Text style={styles.rowMeta}>No experiences listed yet. Crews can book experiences straight from their pot.</Text>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.sm },
  hero: { backgroundColor: colors.ink, borderRadius: radius.xl, padding: spacing.xl, alignItems: "center", gap: spacing.xs, ...shadow.ink },
  heroEyebrow: { ...type.eyebrow, color: colors.onInkMuted },
  heroValue: { fontSize: emoji.xl, lineHeight: 72, fontWeight: font.weight.black, color: colors.onInk },
  heroLabel: { ...type.label, color: colors.onInkMuted },
  heroButton: { alignSelf: "stretch", marginTop: spacing.lg, minHeight: 64 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  rowTitle: { ...type.body, fontWeight: font.weight.bold },
  rowMeta: type.muted,
  rowStrong: { ...type.heading, color: colors.accentDark },
  offerText: { ...type.heading, fontSize: font.size.xl, lineHeight: 28, color: colors.accentDark },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pillLive: { backgroundColor: colors.leafSoft },
  pillPaused: { backgroundColor: colors.cardMuted },
  pillText: { ...type.label, fontSize: font.size.xs, color: colors.text },
  statRow: { flexDirection: "row", gap: spacing.md },
  stat: { flex: 1, alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md },
  statValue: { ...type.title, fontSize: font.size.xxl },
  statLabel: type.label,
  statLine: { ...type.heading, color: colors.accentDark },
});
