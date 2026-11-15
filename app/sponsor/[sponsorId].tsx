import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type ErrorBoundaryProps } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import SponsoredBadge from "../../components/SponsoredBadge";
import PointsPill from "../../components/PointsPill";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { brand, colors, font, spacing, type } from "../../constants/theme";
import { formatPriceLevel, formatRewards } from "../../lib/format";
import { useUserId } from "../../lib/session";
import { offerStatus, perkLabel, sameBusiness, toggleFollow, useBusinessMock } from "../../lib/businessMock";
import { cleanTitle } from "../../lib/format";

function BusinessOffers({ name }: { name: string }) {
  const router = useRouter();
  const allOffers = useBusinessMock((s) => s.offers);
  const following = useBusinessMock((s) => s.following.some((b) => sameBusiness(b, name)));
  const offers = allOffers.filter((o) => sameBusiness(o.businessName, name) && offerStatus(o) === "Live");
  return (
    <>
      <Button
        testID="sponsor-follow"
        label={following ? "Following · you'll get their deals" : "Follow for deals"}
        icon={following ? "✓" : "＋"}
        variant="ghost"
        onPress={() => toggleFollow(name)}
      />
      {offers.length ? <SectionHeader title="Offers for crews" testID="sponsor-offers-header" /> : null}
      {offers.map((o, i) => (
        <Card key={o.id} testID={`sponsor-offer-${i}`} tone="accent" style={styles.itemRow} onPress={() => router.push(`/offer/${o.id}`)}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={styles.itemTitle}>{o.title}</Text>
            <Text style={styles.meta}>
              {perkLabel(o)} · crews of {o.minCrewSize}+
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Card>
      ))}
    </>
  );
}

function errorText(e: unknown) {
  if (e instanceof ConvexError) return String(e.data);
  return e instanceof Error ? e.message : "Couldn't redeem this reward.";
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="sponsor-screen">
      <Stack.Screen options={{ title: "Offer" }} />
      <ErrorState testID="sponsor-error" message={error.message || "Couldn't load this offer."} onRetry={retry} />
    </Screen>
  );
}

export default function SponsorScreen() {
  const router = useRouter();
  const { sponsorId } = useLocalSearchParams<{ sponsorId: string }>();
  const { userId, loading: sessionLoading } = useUserId();
  const validId = !!sponsorId && /^[a-z0-9]{20,40}$/.test(sponsorId);
  const page = useQuery(
    api.businessDashboard.getSponsorPage,
    sessionLoading || !validId ? "skip" : { sponsorId: sponsorId as Id<"sponsors">, userId: (userId ?? undefined) as Id<"users"> | undefined },
  );
  const redeem = useMutation(api.sponsors.redeemReward);
  const [promo, setPromo] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const header = (title: string) => <Stack.Screen options={{ title }} />;

  if (!validId || page === null) {
    return (
      <Screen testID="sponsor-screen">
        {header("Offer")}
        <EmptyState testID="sponsor-empty" emoji="🔍" title="Offer not found" body="This sponsor offer isn't available anymore." />
      </Screen>
    );
  }
  if (sessionLoading || page === undefined) {
    return (
      <Screen testID="sponsor-screen">
        {header("Offer")}
        <LoadingState testID="sponsor-loading" />
      </Screen>
    );
  }
  if (userId && page.diamonds === null) {
    return (
      <Screen testID="sponsor-screen">
        {header("Offer")}
        <ErrorState testID="sponsor-error" message="We couldn't load your account." />
      </Screen>
    );
  }

  const { sponsor } = page;
  const balance = page.diamonds ?? 0;
  const missing = Math.max(0, sponsor.rewardCost - balance);

  const onRedeem = async () => {
    if (!userId) return;
    setRedeeming(true);
    setError(null);
    try {
      const result = await redeem({ userId: userId as Id<"users">, sponsorId: sponsor._id });
      setPromo(result.code);
      setCopied(false);
    } catch (e) {
      setError(errorText(e));
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
    <Screen testID="sponsor-screen">
      {header(sponsor.business)}
      <Card testID="sponsor-card" style={styles.offer}>
        <SponsoredBadge />
        <Title testID="sponsor-business">{sponsor.business}</Title>
        <Text testID="sponsor-offer" style={styles.offerText}>
          {sponsor.offer}
        </Text>
        <Text testID="sponsor-price" style={styles.meta}>
          {[sponsor.area, formatPriceLevel(sponsor.priceLevel), ...sponsor.tags.slice(0, 3)].filter(Boolean).join(" · ")}
        </Text>
      </Card>
      {sponsor.active ? (
        <Button testID="show-qr-offer" label="Show QR for this offer" icon="📱" onPress={() => router.push(`/redeem/offer/${sponsor._id}`)} />
      ) : (
        <Card testID="offer-paused" tone="muted">
          <Text style={styles.meta}>This offer is paused right now.</Text>
        </Card>
      )}

      <BusinessOffers name={sponsor.business} />

      {userId ? (
        <>
          <SectionHeader title="Your rewards" testID="rewards-header" />
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
              <Text style={styles.meta}>Your promo code for {sponsor.business}</Text>
              <Text testID="promo-code" selectable style={styles.promo}>
                {promo}
              </Text>
              <Button testID="copy-promo-code" label={copied ? "Copied!" : "Copy code"} variant="secondary" onPress={onCopy} style={{ alignSelf: "stretch" }} />
            </Card>
          ) : null}
          {error ? <ErrorState testID="redeem-error" message={error} /> : null}
          {sponsor.active ? (
            <Button
              testID="redeem-button"
              label={missing > 0 ? "No rewards ready yet" : `Redeem (uses ${formatRewards(sponsor.rewardCost)})`}
              variant="secondary"
              onPress={onRedeem}
              loading={redeeming}
              disabled={missing > 0}
            />
          ) : null}
          {missing > 0 ? (
            <Subtitle testID="redeem-hint" style={styles.center}>
              Every {brand.pointsPerReward} {brand.points} unlocks a free reward. Check in on group outings to earn them.
            </Subtitle>
          ) : null}

          {page.rewards.map((r, i) => (
            <Card key={r.rewardId} testID={`unlocked-reward-${i}`} style={styles.itemRow}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text style={styles.itemTitle}>Free treat unlocked</Text>
                <Text style={styles.meta}>Code {r.code}</Text>
              </View>
              <Button testID={`show-qr-reward-${i}`} label="Show QR" variant="ghost" onPress={() => router.push(`/redeem/reward/${r.rewardId}`)} />
            </Card>
          ))}
        </>
      ) : null}

      <SectionHeader title="Experiences here" testID="sponsor-experiences-header" />
      {page.experiences.length === 0 ? (
        <EmptyState testID="sponsor-experiences-empty" emoji="🎟️" title="No experiences yet" body={`${sponsor.business} hasn't listed a crew experience yet.`} />
      ) : (
        page.experiences.map((e, i) => (
          <Card key={e.experienceId} testID={`sponsor-experience-${i}`} style={styles.itemRow} onPress={e.usesLeft > 0 ? undefined : () => router.push(`/experience/${e.experienceId}`)}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {cleanTitle(e.title)}
              </Text>
              <Text style={styles.meta}>
                ${e.pricePerPerson} per person · {e.minGroup}-{e.maxGroup} friends
              </Text>
              {e.usesLeft > 0 ? (
                <Text testID={`sponsor-experience-paid-${i}`} style={styles.paid}>
                  Paid · {e.usesLeft} {e.usesLeft === 1 ? "pass" : "passes"} ready
                </Text>
              ) : null}
            </View>
            {e.usesLeft > 0 ? (
              <Button testID={`show-qr-experience-${i}`} label="Show QR" variant="ghost" onPress={() => router.push(`/redeem/experience/${e.experienceId}`)} />
            ) : (
              <Text style={styles.chevron}>›</Text>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  offer: { gap: spacing.md },
  offerText: { fontSize: font.size.xl, lineHeight: 28, fontWeight: font.weight.bold, color: colors.accentDark },
  meta: type.muted,
  row: { flexDirection: "row", justifyContent: "space-between" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  itemTitle: { ...type.body, fontWeight: font.weight.bold },
  paid: { ...type.label, color: colors.success },
  chevron: { ...type.title, color: colors.textMuted },
  promoCard: { alignItems: "center", gap: spacing.md },
  promo: { fontSize: font.size.hero, fontWeight: font.weight.heavy, color: colors.text, letterSpacing: 2, textAlign: "center" },
  center: { textAlign: "center" },
});
