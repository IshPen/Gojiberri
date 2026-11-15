import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, Chip, EmptyState, ErrorState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { colors, font, radius, spacing, type } from "../../constants/theme";
import { formatDay } from "../../lib/format";
import { nextDealAt, offerStatus, saveOffer, sendDeal, useBusinessMock, type MockOffer, type Perk } from "../../lib/businessMock";

const DAY = 24 * 60 * 60 * 1000;
const EXPIRY_OPTIONS = [
  { label: "1 day", days: 1 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "30 days", days: 30 },
];
const SCHOOLS = ["Stanford", "Berkeley"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={type.label}>{label}</Text>
      {children}
    </View>
  );
}

const toInt = (text: string) => (text.trim() === "" ? null : Number.parseInt(text, 10));

export default function OfferEditorScreen() {
  const router = useRouter();
  const { business, offerId } = useLocalSearchParams<{ business?: string; offerId?: string }>();
  const existing = useBusinessMock((s) => s.offers.find((o) => o.id === offerId) ?? null);

  if (!business) {
    return (
      <Screen testID="offer-editor-screen">
        <Stack.Screen options={{ title: "Offer" }} />
        <EmptyState testID="offer-editor-empty" emoji="🏪" title="Pick a business first" body="Open this from your business dashboard." />
      </Screen>
    );
  }
  if (offerId && !existing) {
    return (
      <Screen testID="offer-editor-screen">
        <Stack.Screen options={{ title: "Offer" }} />
        <EmptyState testID="offer-editor-missing" emoji="🔍" title="Offer not found" body="It may have been removed." />
      </Screen>
    );
  }
  return <OfferForm key={offerId ?? "new"} business={business} existing={existing} onDone={() => (router.canGoBack() ? router.back() : router.replace("/sponsor-dashboard"))} />;
}

function OfferForm({ business, existing, onDone }: { business: string; existing: MockOffer | null; onDone: () => void }) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [perk, setPerk] = useState<Perk>(existing?.perk ?? "freebie");
  const [discount, setDiscount] = useState(existing?.discountPercent ? String(existing.discountPercent) : "15");
  const [school, setSchool] = useState(existing?.school ?? "Stanford");
  const [minCrew, setMinCrew] = useState(existing?.minCrewSize ?? 2);
  const [expiryDays, setExpiryDays] = useState<number | null>(existing ? null : 7);
  const [cap, setCap] = useState(existing?.quantityCap ? String(existing.quantityCap) : "");
  const [goji, setGoji] = useState(existing?.gojiCost ? String(existing.gojiCost) : "");
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [dealNote, setDealNote] = useState<string | null>(null);
  const dealAt = useBusinessMock(() => nextDealAt(business));

  const expiresAt = expiryDays === null ? existing!.expiresAt : Date.now() + expiryDays * DAY;

  const onSave = () => {
    setError(null);
    try {
      saveOffer(
        {
          businessName: business,
          title: title.trim(),
          description: description.trim(),
          perk,
          discountPercent: perk === "discount" ? toInt(discount) : null,
          school,
          minCrewSize: minCrew,
          expiresAt,
          quantityCap: toInt(cap),
          gojiCost: toInt(goji) ?? 0,
          active,
        },
        existing?.id,
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the offer.");
    }
  };

  const onSendDeal = () => {
    if (!existing) return;
    try {
      setDealNote(`Sent to ${sendDeal(business, existing.id)} students who follow you or visited in the last 30 days.`);
    } catch (e) {
      setDealNote(e instanceof Error ? e.message : "Couldn't send the deal.");
    }
  };

  return (
    <Screen testID="offer-editor-screen">
      <Stack.Screen options={{ title: existing ? "Edit offer" : "New offer" }} />
      <View style={{ gap: spacing.xs }}>
        <Text style={type.eyebrow}>{business}</Text>
        <Title testID="offer-editor-title">{existing ? "Edit offer" : "Create an offer"}</Title>
        {existing ? (
          <Subtitle testID="offer-editor-counts">
            {offerStatus(existing)} · {existing.claimed} claimed · {existing.redeemed} redeemed
          </Subtitle>
        ) : (
          <Subtitle>Crews claim it on Explore, then show a QR at your counter.</Subtitle>
        )}
      </View>

      <Field label="Title">
        <TextInput testID="offer-title-input" value={title} onChangeText={setTitle} placeholder="Crew boba run" placeholderTextColor={colors.textMuted} style={styles.input} />
      </Field>
      <Field label="Description">
        <TextInput
          testID="offer-description-input"
          value={description}
          onChangeText={setDescription}
          placeholder="What crews get and any fine print"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.input, { minHeight: 88 }]}
        />
      </Field>
      <Field label="Perk">
        <View style={styles.chips}>
          <Chip testID="offer-perk-freebie" label="🎁 Freebie" selected={perk === "freebie"} onPress={() => setPerk("freebie")} />
          <Chip testID="offer-perk-discount" label="🏷️ Discount" selected={perk === "discount"} onPress={() => setPerk("discount")} />
        </View>
        {perk === "discount" ? (
          <TextInput testID="offer-discount-input" value={discount} onChangeText={setDiscount} keyboardType="number-pad" placeholder="% off" placeholderTextColor={colors.textMuted} style={styles.input} />
        ) : null}
      </Field>
      <Field label="Target school">
        <View style={styles.chips}>
          {SCHOOLS.map((s) => (
            <Chip key={s} testID={`offer-school-${s.toLowerCase()}`} label={s} selected={school === s} onPress={() => setSchool(s)} />
          ))}
        </View>
      </Field>
      <Field label="Min crew size">
        <View style={styles.stepper}>
          <Button testID="offer-crew-minus" label="−" variant="secondary" onPress={() => setMinCrew(Math.max(1, minCrew - 1))} style={styles.stepButton} />
          <Text testID="offer-crew-value" style={styles.stepValue}>
            {minCrew}
          </Text>
          <Button testID="offer-crew-plus" label="+" variant="secondary" onPress={() => setMinCrew(Math.min(12, minCrew + 1))} style={styles.stepButton} />
        </View>
      </Field>
      <Field label={expiryDays === null ? `Expires ${formatDay(expiresAt)}` : "Expires in"}>
        <View style={styles.chips}>
          {EXPIRY_OPTIONS.map((o) => (
            <Chip key={o.days} testID={`offer-expiry-${o.days}`} label={o.label} selected={expiryDays === o.days} onPress={() => setExpiryDays(o.days)} />
          ))}
        </View>
      </Field>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Quantity cap">
            <TextInput testID="offer-cap-input" value={cap} onChangeText={setCap} keyboardType="number-pad" placeholder="Unlimited" placeholderTextColor={colors.textMuted} style={styles.input} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Goji cost">
            <TextInput testID="offer-goji-input" value={goji} onChangeText={setGoji} keyboardType="number-pad" placeholder="Free" placeholderTextColor={colors.textMuted} style={styles.input} />
          </Field>
        </View>
      </View>
      {existing ? (
        <Field label="Status">
          <View style={styles.chips}>
            <Chip testID="offer-status-live" label="Live" selected={active} onPress={() => setActive(true)} />
            <Chip testID="offer-status-paused" label="Paused" selected={!active} onPress={() => setActive(false)} />
          </View>
        </Field>
      ) : null}

      {error ? <ErrorState testID="offer-save-error" message={error} /> : null}
      <Button testID="offer-save" label={existing ? "Save changes" : "Publish offer"} onPress={onSave} />

      {existing ? (
        <>
          <SectionHeader title="Send to followers" testID="deal-header" />
          <Card testID="deal-card" tone="muted" style={{ gap: spacing.md }}>
            <Text style={type.muted}>Push this offer in-app to students who follow you and crews that visited in the last 30 days. One deal a week, and students opt in.</Text>
            {dealNote ? (
              <Text testID="deal-note" style={styles.note}>
                {dealNote}
              </Text>
            ) : null}
            <Button
              testID="deal-send"
              label={dealAt > Date.now() ? `Next deal ${formatDay(dealAt)}` : "Send this deal"}
              variant="ghost"
              disabled={dealAt > Date.now() || offerStatus(existing) !== "Live"}
              onPress={onSendDeal}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.size.md,
    color: colors.text,
    backgroundColor: colors.card,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  stepButton: { width: 56, paddingHorizontal: 0 },
  stepValue: { ...type.title, minWidth: 32, textAlign: "center" },
  pair: { flexDirection: "row", gap: spacing.md },
  note: { ...type.body, fontWeight: font.weight.semibold, color: colors.success },
});
