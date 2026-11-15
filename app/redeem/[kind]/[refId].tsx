import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Subtitle, Title } from "../../../components/ui";
import QrCode from "../../../components/QrCode";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { colors, emoji, font, radius, shadow, spacing, type } from "../../../constants/theme";
import { useUserId } from "../../../lib/session";

const KINDS = ["offer", "reward", "experience"] as const;
type Kind = (typeof KINDS)[number];

type Issued = { redemptionId: Id<"redemptions">; code: string; expiresAt: number; itemTitle: string; businessName: string };

function errorText(e: unknown) {
  if (e instanceof ConvexError) return String(e.data);
  return e instanceof Error ? e.message : "Couldn't make a code.";
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function RedeemScreen() {
  const { kind, refId } = useLocalSearchParams<{ kind: string; refId: string }>();
  const { userId, loading: sessionLoading } = useUserId();
  const { width } = useWindowDimensions();
  const createCode = useMutation(api.redemptions.createRedemptionCode);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const validKind = KINDS.includes(kind as Kind) ? (kind as Kind) : null;

  const issue = useCallback(async () => {
    if (!userId || !validKind || !refId) return;
    setIssuing(true);
    setError(null);
    try {
      setIssued(await createCode({ userId: userId as Id<"users">, kind: validKind, refId }));
      setNow(Date.now());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setIssuing(false);
    }
  }, [createCode, userId, validKind, refId]);

  useEffect(() => {
    if (!sessionLoading) void issue();
  }, [sessionLoading, issue]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const status = useQuery(api.redemptions.getRedemption, issued ? { redemptionId: issued.redemptionId } : "skip");

  const header = <Stack.Screen options={{ title: "Show QR" }} />;

  if (!validKind || !refId) {
    return (
      <Screen testID="redeem-screen">
        {header}
        <EmptyState testID="redeem-empty" emoji="🔍" title="Nothing to redeem" body="This link doesn't point at an offer, reward or experience." />
      </Screen>
    );
  }
  if (sessionLoading || (issuing && !issued)) {
    return (
      <Screen testID="redeem-screen">
        {header}
        <LoadingState testID="redeem-loading" label="Making your code…" />
      </Screen>
    );
  }
  if (!userId) {
    return (
      <Screen testID="redeem-screen">
        {header}
        <ErrorState testID="redeem-error" message="Sign in first so we know who's redeeming." />
      </Screen>
    );
  }
  if (error || !issued) {
    return (
      <Screen testID="redeem-screen">
        {header}
        <ErrorState testID="redeem-error" message={error ?? "Couldn't make a code."} onRetry={issue} />
      </Screen>
    );
  }

  const remaining = issued.expiresAt - now;
  const redeemed = status?.status === "redeemed";
  const expired = !redeemed && (status?.status === "expired" || remaining <= 0);
  const qrSize = Math.min(width - spacing.xl * 2 - spacing.lg * 2, 300);

  return (
    <Screen testID="redeem-screen" contentStyle={styles.content}>
      {header}
      <Title testID="redeem-item-title" style={styles.center}>
        {issued.itemTitle}
      </Title>
      {issued.businessName ? (
        <Subtitle testID="redeem-business" style={styles.center}>
          at {issued.businessName}
        </Subtitle>
      ) : null}

      {redeemed ? (
        <Card testID="redeem-success" tone="success" style={styles.result}>
          <Text style={styles.resultEmoji}>✅</Text>
          <Text style={[styles.resultText, { color: colors.success }]}>Redeemed! Enjoy.</Text>
        </Card>
      ) : expired ? (
        <Card testID="redeem-expired" style={[styles.result, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
          <Text style={styles.resultEmoji}>⌛</Text>
          <Text style={[styles.resultText, { color: colors.danger }]}>This code expired</Text>
          <Button testID="redeem-new-code" label="Get a new code" onPress={issue} loading={issuing} style={{ alignSelf: "stretch" }} />
        </Card>
      ) : (
        <>
          <View style={styles.qrFrame}>
            <QrCode testID="redeem-qr" value={issued.code} size={qrSize} color={colors.text} background={colors.card} />
          </View>
          <Text testID="redeem-code-text" selectable style={styles.code}>
            {issued.code}
          </Text>
          <Text testID="redeem-countdown" style={styles.countdown}>
            Expires in {formatCountdown(remaining)}
          </Text>
          <Subtitle style={styles.center}>Show this at the counter. It works once, so no sharing berries.</Subtitle>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "center" },
  center: { textAlign: "center" },
  qrFrame: { marginTop: spacing.sm, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.card, borderWidth: 4, borderColor: colors.accentSoft, ...shadow.card },
  code: { ...type.title, letterSpacing: 4, fontVariant: ["tabular-nums"] },
  countdown: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.accentDark, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, overflow: "hidden", fontVariant: ["tabular-nums"] },
  result: { alignSelf: "stretch", alignItems: "center", gap: spacing.md },
  resultEmoji: { fontSize: emoji.lg },
  resultText: { ...type.title, fontSize: font.size.xl, textAlign: "center" },
});
