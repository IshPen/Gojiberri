import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { colors, font, radius, spacing, emoji as emojiSize } from "../../constants/theme";
import { useBusinessAccount } from "../../lib/businessSession";

type Result = { valid: boolean; reason: string | null; studentName: string | null; crewName: string | null; itemTitle: string | null };

const KIND_LABELS = { offer: "Sponsor offer", reward: "Goji reward", experience: "Experience" } as const;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export default function ScanScreen() {
  const { account, loading } = useBusinessAccount();
  const sponsorId = (account?.sponsorId ?? undefined) as Id<"sponsors"> | undefined;
  const businessId = (account?.businessId ?? undefined) as Id<"businesses"> | undefined;

  const redeem = useMutation(api.redemptions.redeemForBusiness);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const sponsorList = useQuery(api.redemptions.listRedemptions, sponsorId ? { businessId: sponsorId } : "skip");
  const businessList = useQuery(api.redemptions.listRedemptions, businessId ? { businessId } : "skip");
  const lists = [sponsorId ? sponsorList : null, businessId ? businessList : null].filter((l) => l !== null);
  const list = lists.some((l) => l === undefined)
    ? undefined
    : (lists as NonNullable<typeof sponsorList>[]).reduce(
        (acc, l) => ({
          total: acc.total + l.total,
          offers: acc.offers + l.offers,
          rewards: acc.rewards + l.rewards,
          experiences: acc.experiences + l.experiences,
          recent: [...acc.recent, ...l.recent].sort((a, b) => b.redeemedAt - a.redeemedAt).slice(0, 20),
        }),
        { total: 0, offers: 0, rewards: 0, experiences: 0, recent: [] as NonNullable<typeof sponsorList>["recent"] },
      );

  const check = async (code: string) => {
    if (!account || busy.current || !code.trim()) return;
    busy.current = true;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await redeem({ code, sponsorId, businessId }));
      setScanning(false);
      setManualCode("");
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : "Couldn't check that code.");
    } finally {
      busy.current = false;
      setChecking(false);
    }
  };

  const openScanner = async () => {
    setResult(null);
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        setError("Camera access is off. Type the code below instead.");
        return;
      }
    }
    setScanning(true);
  };

  if (loading) {
    return (
      <Screen testID="scan-screen">
        <Stack.Screen options={{ title: "Scan QR" }} />
        <LoadingState testID="scan-loading" />
      </Screen>
    );
  }
  if (!account) return <Redirect href="/business/signin" />;

  return (
    <Screen testID="scan-screen">
      <Stack.Screen options={{ title: "Scan QR" }} />
      <Title testID="scan-title">Redeem a code</Title>
      <Subtitle testID="scan-business-name">Scanning for {account.name}. Only its codes are accepted.</Subtitle>

      {result ? (
        <Card testID={result.valid ? "scan-result-valid" : "scan-result-invalid"} style={[styles.result, result.valid ? styles.valid : styles.invalid]}>
          <Text style={styles.resultEmoji}>{result.valid ? "✅" : "⛔️"}</Text>
          <Text testID="scan-result-text" style={styles.resultText}>
            {result.valid
              ? `Valid: ${result.itemTitle} for ${result.studentName}${result.crewName ? `, ${result.crewName}` : ""}`
              : capitalize(result.reason ?? "this code isn't valid")}
          </Text>
          <Button testID="scan-next" label="Scan next" variant="secondary" onPress={openScanner} style={{ alignSelf: "stretch" }} />
        </Card>
      ) : null}

      {scanning ? (
        <View style={styles.cameraWrap}>
          <CameraView
            testID="scan-camera"
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={checking ? undefined : ({ data }) => void check(data)}
          />
          {checking ? <LoadingState testID="scan-checking" label="Checking…" /> : null}
          <Button testID="scan-cancel" label="Cancel" variant="secondary" onPress={() => setScanning(false)} style={styles.cancel} />
        </View>
      ) : (
        <Button testID="scan-qr-open" label="Scan QR" icon="📷" onPress={openScanner} />
      )}

      {error ? <ErrorState testID="scan-error" message={error} /> : null}

      <SectionHeader title="Or type the code" />
      <Card testID="manual-entry" style={{ gap: spacing.md }}>
        <TextInput
          testID="manual-code-input"
          value={manualCode}
          onChangeText={setManualCode}
          placeholder="GOJI-XXXXXXXX"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          onSubmitEditing={() => check(manualCode)}
        />
        <Button testID="manual-code-submit" label="Check code" onPress={() => check(manualCode)} loading={checking && !scanning} disabled={!manualCode.trim()} />
      </Card>

      <SectionHeader title="Redemptions" testID="redemptions-header" />
      {list === undefined ? (
        <LoadingState testID="redemptions-loading" />
      ) : (
        <>
          <View style={styles.counts}>
            <Card testID="redemptions-total" tone="accent" style={styles.count}>
              <Text style={styles.countValue}>{list.total}</Text>
              <Text style={styles.countLabel}>Total</Text>
            </Card>
            <Card testID="redemptions-sponsorships" tone="muted" style={styles.count}>
              <Text style={styles.countValue}>{list.offers + list.rewards}</Text>
              <Text style={styles.countLabel}>Sponsorships</Text>
            </Card>
            <Card testID="redemptions-experiences" tone="muted" style={styles.count}>
              <Text style={styles.countValue}>{list.experiences}</Text>
              <Text style={styles.countLabel}>Experiences</Text>
            </Card>
          </View>
          {list.recent.length === 0 ? (
            <EmptyState testID="redemptions-empty" emoji="🎟️" title="No redemptions yet" body="Scanned codes show up here." />
          ) : (
            list.recent.map((r, i) => (
              <Card key={r.redemptionId} testID={`redemption-${i}`} style={{ gap: spacing.xs }}>
                <Text style={styles.rowTitle}>{r.itemTitle}</Text>
                <Text style={styles.rowMeta}>
                  {KIND_LABELS[r.kind]} · {r.studentName}
                  {r.crewName ? `, ${r.crewName}` : ""} · {new Date(r.redeemedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </Text>
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  result: { alignItems: "center", gap: spacing.md },
  valid: { backgroundColor: colors.successSoft, borderColor: colors.success },
  invalid: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  resultEmoji: { fontSize: emojiSize.xl },
  resultText: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text, textAlign: "center" },
  cameraWrap: { height: 340, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000", justifyContent: "center" },
  cancel: { position: "absolute", bottom: spacing.md, left: spacing.md, right: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    letterSpacing: 2,
    color: colors.text,
    backgroundColor: colors.background,
  },
  counts: { flexDirection: "row", gap: spacing.sm },
  count: { flex: 1, alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.lg },
  countValue: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.text },
  countLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.textMuted },
  rowTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  rowMeta: { fontSize: font.size.sm, color: colors.textMuted },
});
