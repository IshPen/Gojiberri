import { makeFunctionReference } from "convex/server";
import { ConvexError, type GenericId as Id } from "convex/values";
import { useAction, useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import DemoPaymentLabel from "../../components/DemoPaymentLabel";
import SponsoredBadge from "../../components/SponsoredBadge";
import WhopCard from "../../components/WhopCard";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { colors, font, motion, radius, spacing, type } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { useUserId } from "../../lib/session";
import { formatDollars, mockPlanSplit, mockPotShares, type PlanSplit, type PotShare } from "../../lib/split";

// HOME-38: funds.getPotShares and funds.getPlanSplit, referenced by name until they deploy. Flip SPLIT_MOCK once they do.
const SPLIT_MOCK = true;
const getPotSharesRef = makeFunctionReference<"query", { groupId: Id<"groups"> }, PotShare[]>("funds:getPotShares");
const getPlanSplitRef = makeFunctionReference<"query", { planId: Id<"plans"> }, PlanSplit | null>("funds:getPlanSplit");

const DEFAULT_PER_MEMBER = 20;

type Short = { userId: Id<"users">; name: string; shortBy: number };

function shortFrom(e: unknown): Short[] | null {
  if (!(e instanceof ConvexError)) return null;
  const data = e.data as { code?: string; attendees?: Short[] } | undefined;
  return data?.code === "ATTENDEES_SHORT" ? data.attendees ?? [] : null;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="pot-screen">
      <Stack.Screen options={{ title: "Crew pot" }} />
      <ErrorState testID="pot-error" message={error.message || "We couldn't load this pot."} onRetry={retry} />
    </Screen>
  );
}

export default function PotScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const pid = planId as Id<"plans">;
  const { userId } = useUserId();
  const me = userId as Id<"users"> | null;

  const [busy, setBusy] = useState<"start" | "chip" | "topup" | "pay" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const plan = useQuery(api.plans.getPlan, planId ? { planId: pid } : "skip");
  const groupId = plan?.groupId;
  const pot = useQuery(api.funds.getPot, groupId ? { groupId } : "skip");
  const cardView = useQuery(api.cards.getCard, groupId ? { groupId } : "skip");

  const winner = plan && plan.status === "locked" && plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
  const experienceId = winner?.experienceId;
  const experience = useQuery(api.experiences.getExperience, SPLIT_MOCK && experienceId ? { experienceId } : "skip");

  const liveShares = useQuery(getPotSharesRef, !SPLIT_MOCK && groupId ? { groupId } : "skip");
  const liveSplit = useQuery(getPlanSplitRef, !SPLIT_MOCK && planId && experienceId ? { planId: pid } : "skip");

  const members = plan?.group.members ?? [];
  const shares = SPLIT_MOCK ? (pot ? mockPotShares(members, pot.transactions) : pot) : liveShares;
  const split: PlanSplit | null | undefined = !experienceId || pot === null
    ? null
    : !SPLIT_MOCK
      ? liveSplit
      : experience === undefined || !shares || !pot
        ? undefined
        : experience === null
          ? null
          : mockPlanSplit({
              planId: pid,
              experienceId,
              pricePerPerson: experience.pricePerPerson,
              attendees: members.filter((m) => plan?.votes.some((v) => v.userId === m._id && v.confirmed)),
              shares,
              transactions: pot.transactions,
            });

  const createPot = useMutation(api.funds.createPot);
  const chargeCard = useMutation(api.cards.chargeCard);
  const checkout = useAction(api.whop.createContributionCheckout);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setActionError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      const short = shortFrom(e);
      setActionError(
        short
          ? `Still short: ${short.map((s) => `${s.name} needs ${formatDollars(s.shortBy)}`).join(", ")}.`
          : e instanceof ConvexError
            ? String(e.data)
            : e instanceof Error
              ? e.message
              : "Something went wrong.",
      );
    } finally {
      setBusy(null);
    }
  };

  const addToShare = (amount: number, kind: "chip" | "topup") =>
    run(kind, async () => {
      if (!groupId) return;
      if (!me) throw new Error("Sign in to add money.");
      const url = await checkout({ userId: me, groupId, amount: Math.max(1, amount) });
      await WebBrowser.openBrowserAsync(url);
    });

  const pay = () =>
    run("pay", async () => {
      if (!groupId || !me) return;
      const r = await chargeCard({ userId: me, groupId, planId: pid });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setReceipt(`Paid ${formatDollars(r.amount)} to ${r.business || r.experience} with card •••• ${r.last4}.`);
    });

  const header = <Stack.Screen options={{ title: "Crew pot" }} />;

  if (plan === undefined || (plan && (pot === undefined || cardView === undefined || shares === undefined || split === undefined))) {
    return (
      <Screen testID="pot-screen">
        {header}
        <LoadingState label="Counting the berries…" testID="pot-loading" />
      </Screen>
    );
  }
  if (plan === null) {
    return (
      <Screen testID="pot-screen">
        {header}
        <ErrorState testID="pot-error" message="We couldn't find that plan." />
      </Screen>
    );
  }

  const crewName = plan.group.name || "Your crew";

  if (!pot) {
    return (
      <Screen testID="pot-screen">
        {header}
        <Title testID="pot-title">{crewName}</Title>
        <EmptyState
          testID="pot-empty"
          actionTestID="pot-start-button"
          emoji="🫙"
          title="Start a crew pot"
          body="Everyone keeps their own share inside it. It only pays for experiences, split evenly between whoever's going."
          actionLabel={busy === "start" ? "Starting…" : "Start a pot"}
          onAction={busy ? undefined : () => run("start", async () => void (await createPot({ groupId: plan.groupId, monthlyContribution: DEFAULT_PER_MEMBER })))}
        />
        {actionError ? <ActionError message={actionError} /> : null}
      </Screen>
    );
  }

  const myShare = shares?.find((s) => s.userId === me)?.balance ?? 0;
  const chipAmount = pot.monthlyContribution || DEFAULT_PER_MEMBER;
  const sponsors = pot.transactions.filter((t) => t.type === "contribution" && t.status === "completed" && !t.userId);
  const chipIns = (shares ?? []).filter((s) => s.contributed > 0).sort((a, b) => b.contributed - a.contributed);

  return (
    <Screen testID="pot-screen">
      {header}
      <Title testID="pot-title">{crewName}</Title>

      <Card testID="pot-share-card" style={styles.shareCard}>
        <Text style={type.eyebrow}>Your share</Text>
        <Text testID="pot-my-share" style={styles.shareValue}>
          {formatDollars(myShare)}
        </Text>
        <Text style={styles.muted}>
          {formatDollars(pot.balance)} in the pot. Leftovers stay yours and roll over.
        </Text>
      </Card>

      {split ? (
        <SplitCard
          split={split}
          me={me}
          day={new Date(plan.window.start).toLocaleDateString(undefined, { weekday: "long" })}
          title={winner?.title ?? "The experience"}
          busy={busy}
          receipt={receipt}
          onTopUp={(amount) => addToShare(amount, "topup")}
          onPay={pay}
        />
      ) : winner ? (
        <Card testID="pot-not-experience" tone="muted">
          <Text style={styles.muted}>{winner.title} isn't a bookable experience, so the pot isn't charged. Everyone pays their own way.</Text>
        </Card>
      ) : null}

      {actionError ? <ActionError message={actionError} /> : null}

      <WhopCard crewName={crewName} balance={pot.balance} goal={split?.total || pot.balance} last4={cardView?.card.last4} limit={cardView?.limit ?? pot.balance} sandbox />

      <Button
        testID="pot-chip-in-button"
        label={`Add ${formatDollars(chipAmount)} to my share`}
        variant={split && !split.charged ? "secondary" : "primary"}
        loading={busy === "chip"}
        disabled={!!busy}
        onPress={() => addToShare(chipAmount, "chip")}
      />
      <DemoPaymentLabel testID="pot-chip-in-demo" />

      <SectionHeader title="Everyone's share" testID="pot-shares-title" />
      <View testID="pot-shares" style={styles.list}>
        {(shares ?? []).map((s, i) => (
          <View key={s.userId} testID={`pot-share-${i}`} style={styles.row}>
            <Avatar name={s.name} />
            <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
              {s.name}
              {s.userId === me ? " (you)" : ""}
            </Text>
            <Text testID={`pot-share-${i}-balance`} style={styles.amount}>
              {formatDollars(s.balance)}
            </Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Chip-ins" testID="pot-contributors-title" />
      {chipIns.length + sponsors.length === 0 ? (
        <EmptyState testID="pot-contributors-empty" emoji="🫙" title="No chip-ins yet" body="Add to your share and the crew can book its first experience." />
      ) : (
        <View testID="pot-contributors" style={styles.list}>
          {chipIns.map((s, i) => (
            <View key={s.userId} testID={`pot-contributor-${i}`} style={styles.row}>
              <Avatar name={s.name} />
              <Text testID={`pot-contributor-${i}-name`} style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                {s.name}
                {s.userId === me ? " (you)" : ""}
              </Text>
              <Text testID={`pot-contributor-${i}-amount`} style={styles.amount}>
                {formatDollars(s.contributed)}
              </Text>
            </View>
          ))}
          {sponsors.map((t, i) => (
            <View key={t._id} testID={`pot-sponsor-${i}`} style={styles.row}>
              <Avatar name="⭐" sponsor />
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text style={styles.name} numberOfLines={1}>
                  {t.note ?? "A local sponsor"}
                </Text>
                <SponsoredBadge testID={`pot-sponsor-${i}-sponsored`} />
              </View>
              <Text style={styles.sponsorAmount}>{formatDollars(t.amount)} off everyone</Text>
            </View>
          ))}
        </View>
      )}

      {receipt ? <ConfettiCannon testID="pot-confetti" count={140} origin={{ x: -10, y: 0 }} colors={motion.confettiColors} fallSpeed={2600} fadeOut autoStart /> : null}
    </Screen>
  );
}

function SplitCard({
  split,
  me,
  day,
  title,
  busy,
  receipt,
  onTopUp,
  onPay,
}: {
  split: PlanSplit;
  me: Id<"users"> | null;
  day: string;
  title: string;
  busy: string | null;
  receipt: string | null;
  onTopUp: (amount: number) => void;
  onPay: () => void;
}) {
  const mine = split.attendees.find((a) => a.userId === me);
  const sponsorEach = split.attendees.length > 0 ? split.sponsorCredit / split.attendees.length : 0;
  return (
    <Card testID="pot-split-card" tone="accent" style={styles.split}>
      <Text style={type.eyebrow}>{title}</Text>
      <Text testID="pot-split-cost" style={styles.splitCost}>
        {mine ? `${day} costs you ${formatDollars(mine.share)}` : `${day} costs about ${formatDollars(split.perPerson)} each`}
      </Text>
      {split.sponsorCredit > 0 ? (
        <Text testID="pot-split-sponsor" style={styles.muted}>
          Sponsors chipped in {formatDollars(split.sponsorCredit)}, so everyone pays {formatDollars(Math.floor(sponsorEach * 100) / 100)} less.
        </Text>
      ) : null}
      <View style={styles.list}>
        {split.attendees.map((a, i) => (
          <View key={a.userId} testID={`pot-attendee-${i}`} style={styles.attendee}>
            <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
              {a.name}
              {a.userId === me ? " (you)" : ""}
            </Text>
            <Text testID={`pot-attendee-${i}-share`} style={styles.attendeeShare}>
              {formatDollars(a.share)}
            </Text>
            <Text testID={`pot-attendee-${i}-status`} style={a.shortBy > 0 ? styles.short : styles.covered}>
              {a.shortBy > 0 ? `needs ${formatDollars(a.shortBy)}` : "✓ covered"}
            </Text>
          </View>
        ))}
      </View>
      {split.charged || receipt ? (
        <Text testID="pot-paid" style={styles.covered}>
          {receipt ?? "Paid ✓ See you there."}
        </Text>
      ) : (
        <>
          {mine && mine.shortBy > 0 ? (
            <>
              <Button
                testID="pot-top-up"
                label={mine.shortBy < 1 ? "Top up $1 (min)" : `Top up ${formatDollars(mine.shortBy)}`}
                loading={busy === "topup"}
                disabled={!!busy}
                onPress={() => onTopUp(mine.shortBy)}
              />
              <DemoPaymentLabel testID="pot-top-up-demo" />
              {mine.shortBy < 1 ? (
                <Text testID="pot-top-up-min" style={[styles.muted, { textAlign: "center" }]}>
                  Top-ups start at $1. The extra stays in your share.
                </Text>
              ) : null}
            </>
          ) : null}
          <Button
            testID="pot-pay"
            label="Pay for the experience"
            variant={mine && mine.shortBy > 0 ? "secondary" : "primary"}
            loading={busy === "pay"}
            disabled={!!busy || !split.allCovered}
            onPress={onPay}
          />
          {!split.allCovered ? <Text style={[styles.muted, { textAlign: "center" }]}>Unlocks once everyone's covered.</Text> : null}
        </>
      )}
    </Card>
  );
}

function ActionError({ message }: { message: string }) {
  return (
    <Text testID="pot-action-error" style={styles.error}>
      {message}
    </Text>
  );
}

function Avatar({ name, sponsor }: { name: string; sponsor?: boolean }) {
  return (
    <View style={[styles.avatar, sponsor && { backgroundColor: colors.warningSoft }]}>
      <Text style={styles.avatarText}>{sponsor ? name : name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shareCard: { alignItems: "center", gap: spacing.xs },
  shareValue: { ...type.display, fontSize: 48, lineHeight: 56, color: colors.accentDark, fontVariant: ["tabular-nums"] },
  muted: type.muted,
  split: { gap: spacing.md },
  splitCost: type.title,
  attendee: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  attendeeShare: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  covered: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.leaf },
  short: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.accentDark },
  error: { color: colors.danger, fontSize: font.size.sm, fontWeight: font.weight.semibold, textAlign: "center" },
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.accentDark },
  name: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  amount: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.text, fontVariant: ["tabular-nums"] },
  sponsorAmount: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.warning },
});
