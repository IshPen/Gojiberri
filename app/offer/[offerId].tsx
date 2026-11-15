import { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Button, Card, EmptyState, ErrorState, Screen, Subtitle, Title } from "../../components/ui";
import QrCode from "../../components/QrCode";
import SponsoredBadge from "../../components/SponsoredBadge";
import { brand, colors, font, radius, shadow, spacing, type } from "../../constants/theme";
import { formatDay } from "../../lib/format";
import { claimOffer, offerStatus, perkLabel, sameBusiness, toggleFollow, useBusinessMock } from "../../lib/businessMock";

export default function OfferScreen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const { width } = useWindowDimensions();
  const offer = useBusinessMock((s) => s.offers.find((o) => o.id === offerId) ?? null);
  const code = useBusinessMock((s) => (offerId ? s.claims[offerId] ?? null : null));
  const following = useBusinessMock((s) => (offer ? s.following.some((b) => sameBusiness(b, offer.businessName)) : false));
  const [error, setError] = useState<string | null>(null);

  if (!offer) {
    return (
      <Screen testID="offer-screen">
        <Stack.Screen options={{ title: "Offer" }} />
        <EmptyState testID="offer-empty" emoji="🔍" title="Offer not found" body="This offer isn't available anymore." />
      </Screen>
    );
  }

  const status = offerStatus(offer);
  const left = offer.quantityCap === null ? null : Math.max(0, offer.quantityCap - offer.claimed);

  const onClaim = () => {
    setError(null);
    try {
      claimOffer(offer.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't claim this offer.");
    }
  };

  return (
    <Screen testID="offer-screen">
      <Stack.Screen options={{ title: offer.businessName }} />
      <Card testID="offer-card" style={{ gap: spacing.md }}>
        <SponsoredBadge testID="offer-badge" />
        <Text style={type.eyebrow}>{offer.businessName}</Text>
        <Title testID="offer-title">{offer.title}</Title>
        <Text testID="offer-perk" style={styles.perk}>
          {perkLabel(offer)}
        </Text>
        {offer.description ? <Text style={type.body}>{offer.description}</Text> : null}
        <Text testID="offer-terms" style={type.muted}>
          {offer.school} crews of {offer.minCrewSize}+ · ends {formatDay(offer.expiresAt)}
          {left !== null ? ` · ${left} left` : ""}
          {offer.gojiCost ? ` · ${offer.gojiCost} ${brand.points}` : " · Free"}
        </Text>
      </Card>

      {code ? (
        <Card testID="offer-qr-card" style={styles.qrCard}>
          <Subtitle>Show this at {offer.businessName}</Subtitle>
          <View style={styles.qrWrap}>
            <QrCode testID="offer-qr" value={code} size={Math.min(width - spacing.xl * 4, 260)} />
          </View>
          <Text testID="offer-code" selectable style={styles.code}>
            {code}
          </Text>
        </Card>
      ) : (
        <>
          {error ? <ErrorState testID="offer-claim-error" message={error} /> : null}
          <Button
            testID="offer-claim"
            label={status !== "Live" ? status : offer.gojiCost ? `Claim for ${offer.gojiCost} ${brand.points}` : "Claim offer"}
            disabled={status !== "Live"}
            onPress={onClaim}
          />
        </>
      )}
      <Button
        testID="offer-follow"
        label={following ? `Following ${offer.businessName}` : `Follow ${offer.businessName} for deals`}
        variant="ghost"
        onPress={() => toggleFollow(offer.businessName)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  perk: { ...type.title, color: colors.accentDark },
  qrCard: { alignItems: "center", gap: spacing.md },
  qrWrap: { padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.sm },
  code: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text, letterSpacing: 2 },
});
