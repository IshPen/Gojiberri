import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useAction, useMutation, useQuery } from "convex/react";
import { Stack, useLocalSearchParams, useRouter, type ErrorBoundaryProps } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import SponsoredBadge from "../../components/SponsoredBadge";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { colors, font, radius, spacing, emoji as emojiSize } from "../../constants/theme";
import { experienceEmoji, groupSize } from "../../lib/experiences";
import { useUserId } from "../../lib/session";

type Crew = {
  groupId: Id<"groups">;
  name: string;
  memberCount: number;
  potBalance: number | null;
  lockedPlanId: Id<"plans"> | null;
  confirmedCount: number | null;
};
type ExperienceForPurchase = {
  _id: Id<"experiences">;
  title: string;
  description: string;
  pricePerPerson: number;
  minGroup: number;
  maxGroup: number;
  tags: string[];
  imageUrl: string | null;
  active: boolean;
  onWhop: boolean;
  businessName: string;
  placeName: string | null;
  area: string | null;
  category: string | null;
  partner: boolean;
  crews: Crew[];
};
type MyPurchase = { purchaseId: string; status: "pending" | "completed" | "failed"; amount: number; quantity: number } | null;
type Receipt = { amount: number; people: number; experience: string; business: string; last4: string; balance: number };

const getForPurchaseRef = makeFunctionReference<
  "query",
  { experienceId: Id<"experiences">; userId?: Id<"users"> },
  ExperienceForPurchase | null
>("experienceShop:getForPurchase");
const checkoutRef = makeFunctionReference<
  "action",
  { experienceId: Id<"experiences">; userId: Id<"users">; groupId?: Id<"groups"> },
  string
>("experienceCheckout:createExperienceCheckout");
const myPurchaseRef = makeFunctionReference<
  "query",
  { userId: Id<"users">; experienceId: Id<"experiences"> },
  MyPurchase
>("purchases:getMyPurchase");
const chargeCardRef = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; groupId: Id<"groups">; planId: Id<"plans"> },
  Receipt
>("cards:chargeCard");

const WHOP_EXPERIENCE_CHECKOUT_LIVE = false;

function errorText(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return message.replace(/^.*Uncaught (?:Convex)?Error: /s, "").split("\n")[0];
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="experience-screen" edges={["bottom"]}>
      <ErrorState testID="experience-error" message={error.message} onRetry={retry} />
    </Screen>
  );
}

export default function ExperienceDetailScreen() {
  const router = useRouter();
  const { experienceId } = useLocalSearchParams<{ experienceId: string }>();
  const { userId, loading: sessionLoading } = useUserId();
  const experience = useQuery(
    getForPurchaseRef,
    sessionLoading
      ? "skip"
      : { experienceId: experienceId as Id<"experiences">, ...(userId ? { userId: userId as Id<"users"> } : {}) },
  );
  const myPurchase = useQuery(
    myPurchaseRef,
    WHOP_EXPERIENCE_CHECKOUT_LIVE && userId
      ? { userId: userId as Id<"users">, experienceId: experienceId as Id<"experiences"> }
      : "skip",
  );
  const createCheckout = useAction(checkoutRef);
  const chargeCard = useMutation(chargeCardRef);

  const [crewId, setCrewId] = useState<Id<"groups"> | null>(null);
  const [buying, setBuying] = useState(false);
  const [checkoutOpened, setCheckoutOpened] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const header = <Stack.Screen options={{ title: experience?.businessName ?? "Experience" }} />;

  if (experience === undefined) {
    return (
      <Screen testID="experience-screen" edges={["bottom"]}>
        {header}
        <LoadingState testID="experience-loading" label="Loading experience…" />
      </Screen>
    );
  }
  if (experience === null) {
    return (
      <Screen testID="experience-screen" edges={["bottom"]}>
        {header}
        <EmptyState testID="experience-not-found" emoji="🔍" title="Experience not found" body="It may have been taken down by the business." />
      </Screen>
    );
  }

  const crew = experience.crews.find((c) => c.groupId === crewId) ?? experience.crews[0] ?? null;
  const people =
    crew?.confirmedCount ??
    (crew ? Math.min(Math.max(crew.memberCount, experience.minGroup), experience.maxGroup) : experience.minGroup);
  const potCost = experience.pricePerPerson * people;

  async function buyWithWhop() {
    if (!userId) return;
    setBuying(true);
    setBuyError(null);
    try {
      const url = await createCheckout({
        experienceId: experience!._id,
        userId: userId as Id<"users">,
        ...(crew ? { groupId: crew.groupId } : {}),
      });
      setCheckoutOpened(true);
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      setBuyError(errorText(e));
    } finally {
      setBuying(false);
    }
  }

  async function payFromPot() {
    if (!userId || !crew?.lockedPlanId) return;
    setPaying(true);
    setPayError(null);
    try {
      setReceipt(await chargeCard({ userId: userId as Id<"users">, groupId: crew.groupId, planId: crew.lockedPlanId }));
    } catch (e) {
      setPayError(errorText(e));
    } finally {
      setPaying(false);
    }
  }

  let potBlocker: string | null = null;
  if (!userId) potBlocker = "Sign in to pay from a crew pot";
  else if (!crew) potBlocker = "Join a crew to pay from a pot";
  else if (crew.potBalance === null) potBlocker = `${crew.name} doesn't have a pot yet`;
  else if (crew.potBalance < potCost) potBlocker = `${crew.name}'s pot has $${crew.potBalance}, this needs about $${potCost}`;
  else if (!crew.lockedPlanId) potBlocker = "Lock a plan with this experience to pay from the pot";

  return (
    <Screen testID="experience-screen" edges={["bottom"]}>
      {header}
      {experience.imageUrl ? (
        <Image source={{ uri: experience.imageUrl }} style={styles.hero} testID="experience-photo" />
      ) : (
        <View style={[styles.hero, styles.emojiHero]} testID="experience-emoji">
          <Text style={styles.heroEmoji}>{experienceEmoji(experience.category)}</Text>
        </View>
      )}

      {experience.partner ? <SponsoredBadge testID="experience-sponsored" /> : null}
      <Text style={styles.business} testID="experience-business">
        {experience.businessName}
        {experience.area ? ` · ${experience.area}` : ""}
      </Text>
      <Title testID="experience-title">{experience.title}</Title>
      <Text style={styles.price} testID="experience-price">
        ${experience.pricePerPerson} per person · {groupSize(experience.minGroup, experience.maxGroup)}
      </Text>
      <Subtitle testID="experience-description">{experience.description}</Subtitle>
      {experience.placeName ? (
        <Text style={styles.meta} testID="experience-place">
          📍 {experience.placeName}
        </Text>
      ) : null}

      {experience.crews.length > 1 ? (
        <>
          <SectionHeader title="Buying for" testID="experience-crew-header" />
          <View style={styles.chips} testID="experience-crew-picker">
            {experience.crews.map((c) => (
              <Chip
                key={c.groupId}
                testID={`experience-crew-${c.groupId}`}
                label={c.name}
                selected={crew?.groupId === c.groupId}
                onPress={() => {
                  setCrewId(c.groupId);
                  setPayError(null);
                  setReceipt(null);
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader title="Buy with Whop" testID="experience-whop-header" />
      <Card testID="experience-whop-card">
        <Text style={styles.meta}>Pay ${experience.pricePerPerson} for your spot with Whop checkout (sandbox, no real money).</Text>
        {WHOP_EXPERIENCE_CHECKOUT_LIVE ? (
          <>
            <Button
              testID="experience-buy-whop"
              label="Buy with Whop"
              icon="🛒"
              loading={buying}
              disabled={!userId || !experience.active}
              onPress={buyWithWhop}
              style={styles.action}
            />
            {!userId ? (
              <Text style={styles.note} testID="experience-whop-signin">
                Sign in to buy.
              </Text>
            ) : null}
            {myPurchase?.status === "completed" ? (
              <Text style={styles.success} testID="experience-whop-completed">
                Paid ${myPurchase.amount}. Your spot is booked.
              </Text>
            ) : myPurchase?.status === "pending" || (checkoutOpened && !buyError) ? (
              <Text style={styles.note} testID="experience-whop-pending">
                Payment pending, we&apos;ll confirm once Whop does.
              </Text>
            ) : myPurchase?.status === "failed" ? (
              <Text style={styles.error} testID="experience-whop-failed">
                Your last payment couldn&apos;t be confirmed. Try again.
              </Text>
            ) : null}
            {buyError ? (
              <Text style={styles.error} testID="experience-whop-error">
                {buyError}
              </Text>
            ) : null}
          </>
        ) : (
          <Button
            testID="experience-buy-whop"
            label="Whop checkout coming soon"
            icon="🛒"
            disabled
            onPress={() => {}}
            style={styles.action}
          />
        )}
      </Card>

      {myPurchase?.status === "completed" || receipt ? (
        <Button testID="experience-show-qr" label="Show QR to redeem" icon="📱" onPress={() => router.push(`/redeem/experience/${experience._id}`)} />
      ) : null}

      <SectionHeader title="Pay from crew pot" testID="experience-pot-header" />
      <Card testID="experience-pot-card" tone={receipt ? "success" : "default"}>
        {receipt ? (
          <View testID="experience-pot-receipt">
            <Text style={styles.receiptTitle}>Paid ${receipt.amount} with card •••• {receipt.last4}</Text>
            <Text style={styles.meta}>
              {receipt.experience} at {receipt.business} for {receipt.people}. ${receipt.balance} left in the pot.
            </Text>
          </View>
        ) : (
          <>
            {crew ? (
              <Text style={styles.meta} testID="experience-pot-summary">
                {crew.name}: {crew.confirmedCount !== null ? "" : "about "}${potCost} for {people}
                {crew.potBalance !== null ? ` · $${crew.potBalance} in the pot` : ""}
              </Text>
            ) : null}
            {potBlocker ? (
              <Text style={styles.note} testID="experience-pot-blocked">
                {potBlocker}
              </Text>
            ) : (
              <Button
                testID="experience-pay-pot"
                label="Pay from crew pot"
                icon="💳"
                variant="secondary"
                loading={paying}
                onPress={payFromPot}
                style={styles.action}
              />
            )}
            {payError ? (
              <Text style={styles.error} testID="experience-pot-error">
                {payError}
              </Text>
            ) : null}
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: 180, borderRadius: radius.lg, marginBottom: spacing.md },
  emojiHero: { backgroundColor: colors.cardMuted, alignItems: "center", justifyContent: "center" },
  heroEmoji: { fontSize: emojiSize.xl },
  business: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted, marginTop: spacing.sm },
  price: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.accent, marginVertical: spacing.xs },
  meta: { fontSize: font.size.sm, color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { marginTop: spacing.md },
  note: { fontSize: font.size.sm, color: colors.textMuted, marginTop: spacing.sm },
  success: { fontSize: font.size.sm, color: colors.success, fontWeight: font.weight.semibold, marginTop: spacing.sm },
  error: { fontSize: font.size.sm, color: colors.danger, marginTop: spacing.sm },
  receiptTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.success, marginBottom: spacing.xs },
});
