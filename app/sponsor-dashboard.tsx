import { useEffect, useState } from "react";
import { AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, type ErrorBoundaryProps } from "expo-router";
import { useQuery } from "convex/react";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../components/ui";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { brand, colors, emoji, font, radius, shadow, spacing, type } from "../constants/theme";
import { formatTime } from "../lib/format";
import type { FunctionReturnType } from "convex/server";
import { offerStatus, perkLabel, sameBusiness, useBusinessMock } from "../lib/businessMock";
import { cleanTitle } from "../lib/format";

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

type Home = NonNullable<FunctionReturnType<typeof api.businessDashboard.getHome>>;

function BusinessTools({ name, home }: { name: string; home: Home }) {
  const router = useRouter();
  const allOffers = useBusinessMock((s) => s.offers);
  const rules = useBusinessMock((s) => s.rules);
  const allReviews = useBusinessMock((s) => s.reviews);
  const followers = useBusinessMock((s) => s.followers);
  const offers = allOffers.filter((o) => sameBusiness(o.businessName, name));
  const rule = Object.values(rules).find((r) => sameBusiness(r.businessName, name)) ?? null;
  const reviews = allReviews.filter((r) => sameBusiness(r.businessName, name));
  const avg = reviews.length ? reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length : 0;
  const unreplied = reviews.filter((r) => !r.reply).length;
  const go = (pathname: "/business/offer" | "/business/rules" | "/business/reviews", params: Record<string, string> = {}) =>
    router.push({ pathname, params: { business: name, ...params } });

  const stats = [
    { id: "claimed", label: "Offers claimed / redeemed", value: `${offers.reduce((s, o) => s + o.claimed, 0)} / ${offers.reduce((s, o) => s + o.redeemed, 0)}` },
    { id: "sold", label: "Experiences sold", value: String(home.sales?.sold ?? 0) },
    { id: "earnings", label: "Earnings", value: money(home.sales?.earned ?? 0) },
    { id: "chipins", label: "Pot chip-ins", value: money((home.sponsorship?.chipIns.total ?? 0) + (rule?.spentThisMonth ?? 0)) },
    { id: "followers", label: "Followers", value: String(Object.entries(followers).find(([b]) => sameBusiness(b, name))?.[1] ?? 0) },
  ];

  return (
    <>
      <SectionHeader title="Stats" testID="stats-header" />
      <View style={styles.statGrid} testID="stats-grid">
        {stats.map((s) => (
          <Card key={s.id} testID={`stats-${s.id}`} tone="muted" style={styles.statTile}>
            <Text testID={`stats-${s.id}-value`} style={styles.tileValue}>
              {s.value}
            </Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </Card>
        ))}
      </View>

      <SectionHeader title="Your offers" testID="my-offers-header" />
      {offers.length === 0 ? (
        <Card testID="my-offers-empty" tone="muted">
          <Text style={styles.rowMeta}>No offers yet. Create one and Stanford crews see it on Explore.</Text>
        </Card>
      ) : (
        offers.map((o, i) => (
          <Card key={o.id} testID={`my-offer-${i}`} style={styles.row} onPress={() => go("/business/offer", { offerId: o.id })}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {o.title}
              </Text>
              <Text style={styles.rowMeta}>
                {perkLabel(o)} · {offerStatus(o)} · {o.claimed} claimed · {o.redeemed} redeemed
              </Text>
            </View>
            <Text style={styles.rowStrong}>›</Text>
          </Card>
        ))
      )}
      <Button testID="create-offer" label="Create offer" icon="✨" variant="secondary" onPress={() => go("/business/offer")} />

      <SectionHeader title="Sponsorship rules" testID="rules-header" />
      <Card testID="rules-card" onPress={() => go("/business/rules")} style={{ gap: spacing.sm }}>
        {rule ? (
          <>
            <Text style={styles.rowTitle}>
              Chip {money(rule.amount)} into a crew's pot when they pick you{rule.active ? "" : " (paused)"}
            </Text>
            <View style={styles.meter}>
              <View style={[styles.meterFill, { width: `${Math.min(100, (rule.spentThisMonth / rule.monthlyBudget) * 100)}%` }]} />
            </View>
            <Text testID="rules-budget" style={styles.rowMeta}>
              {money(rule.spentThisMonth)} of {money(rule.monthlyBudget)} this month
            </Text>
          </>
        ) : (
          <Text style={styles.rowMeta}>Set up auto-sponsorship: chip into a crew's pot whenever they lock a plan with you.</Text>
        )}
      </Card>

      <SectionHeader title="Reviews" testID="reviews-header" />
      <Card testID="reviews-card" onPress={() => go("/business/reviews")} style={styles.row}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text testID="reviews-average" style={styles.rowTitle}>
            {reviews.length ? `★ ${avg.toFixed(1)} from ${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}` : "No reviews yet"}
          </Text>
          <Text style={styles.rowMeta}>{unreplied ? `${unreplied} waiting on your reply` : "All caught up"}</Text>
        </View>
        <Text style={styles.rowStrong}>›</Text>
      </Card>
    </>
  );
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

  const [funding, setFunding] = useState(false);
  const [funded, setFunded] = useState(false);

  const fund = async () => {
    setFunding(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setFunded(true);
    setFunding(false);
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
          <BusinessTools name={account.name} home={home} />

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
              {funded ? (
                <Text testID="fund-received" style={styles.fundReceived}>
                  Payment received ✓ Your quests are funded.
                </Text>
              ) : null}
              <Button testID="fund-quests" label="Fund more quests" icon="💸" variant="secondary" onPress={fund} loading={funding} />
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
                        {cleanTitle(e.title)}
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
  fundReceived: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.success, textAlign: "center" },
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
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statTile: { flexBasis: "47%", flexGrow: 1, gap: spacing.xs, padding: spacing.lg },
  tileValue: { ...type.heading, fontSize: font.size.xl },
  meter: { height: 10, borderRadius: radius.pill, backgroundColor: colors.cardMuted, overflow: "hidden" },
  meterFill: { height: 10, borderRadius: radius.pill, backgroundColor: colors.accent },
});
