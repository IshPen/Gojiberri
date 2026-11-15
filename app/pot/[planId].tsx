import type { GenericId as Id } from "convex/values";
import { useAction, useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import SponsoredBadge from "../../components/SponsoredBadge";
import WhopCard from "../../components/WhopCard";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { colors, font, radius, spacing, type } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { friendlyError } from "../../lib/errors";
import { avatarFor } from "../../lib/avatar";
import { useUserId } from "../../lib/session";
import { formatDollars, type PlanSplit } from "../../lib/split";
import { cleanTitle } from "../../lib/format";
import Basket from "../../components/Basket";
import BerryBurst from "../../components/BerryBurst";

const DEFAULT_PER_MEMBER = 20;

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="pot-screen">
      <Stack.Screen options={{ title: "Crew basket" }} />
      <ErrorState testID="pot-error" message={error.message || "We couldn't load this basket."} onRetry={retry} />
    </Screen>
  );
}

export default function PotScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const pid = planId as Id<"plans">;
  const { userId } = useUserId();
  const me = userId as Id<"users"> | null;

  const [busy, setBusy] = useState<"start" | "chip" | "topup" | "pay" | "issue" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const plan = useQuery(api.plans.getPlan, planId ? { planId: pid } : "skip");
  const groupId = plan?.groupId;
  const pot = useQuery(api.funds.getPot, groupId ? { groupId } : "skip");
  const cardView = useQuery(api.cards.getCard, groupId ? { groupId } : "skip");

  const winner = plan && plan.status === "locked" && plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
  const experienceId = winner?.experienceId;
  const shares = useQuery(api.funds.getPotShares, groupId ? { groupId } : "skip");
  const liveSplit = useQuery(api.funds.getPlanSplit, planId && experienceId ? { planId: pid } : "skip");
  const rawSplit: PlanSplit | null | undefined = !experienceId || pot === null ? null : liveSplit;
  const group = useQuery(api.groups.getGroup, groupId ? { groupId } : "skip");
  const avatarOf = (userId: Id<"users">) => group?.members.find((m) => m._id === userId)?.avatarUrl;
  const estimated = !!rawSplit && rawSplit.attendees.length === 0 && !rawSplit.charged && !!shares?.length && !!winner && !!pot;
  const split: PlanSplit | null | undefined = (() => {
    if (!estimated || !rawSplit || !shares || !winner || !pot) return rawSplit;
    const n = shares.length;
    const totalCents = Math.round(winner.costMin * 100) * n;
    const sponsorCents = Math.min(
      totalCents,
      pot.transactions
        .filter((t) => t.type === "contribution" && t.status === "completed" && !t.userId && t.planId === pid)
        .reduce((sum, t) => sum + Math.round(t.amount * 100), 0),
    );
    const netCents = totalCents - sponsorCents;
    const baseCents = Math.floor(netCents / n);
    const extraCents = netCents % n;
    return {
      ...rawSplit,
      total: totalCents / 100,
      sponsorCredit: sponsorCents / 100,
      perPerson: (baseCents + (extraCents ? 1 : 0)) / 100,
      allCovered: false,
      attendees: shares.map((s, i) => {
        const share = baseCents + (i < extraCents ? 1 : 0);
        return { userId: s.userId, name: s.name, balance: s.balance, share: share / 100, shortBy: Math.max(0, share - Math.round(s.balance * 100)) / 100 };
      }),
    };
  })();

  const createPot = useMutation(api.funds.createPot);
  const chargeCard = useMutation(api.cards.chargeCard);
  const issueCard = useMutation(api.cards.issueCard);
  const checkout = useAction(api.whop.createContributionCheckout);
  const startCheckout = useMutation(api.whopMock.startContributionCheckout);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setActionError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const addToShare = (amount: number, kind: "chip" | "topup") =>
    run(kind, async () => {
      if (!groupId) return;
      if (!me) throw new Error("Sign in to add money.");
      const start = await startCheckout({ userId: me, groupId, amount });
      const url = start.mode === "mock" ? start.checkoutUrl : await checkout({ userId: me, groupId, amount });
      await WebBrowser.openBrowserAsync(url);
    });

  const pay = () =>
    run("pay", async () => {
      if (!groupId || !me) return;
      const r = await chargeCard({ userId: me, groupId, planId: pid });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setReceipt(`Paid ${formatDollars(r.amount)} to ${r.business || r.experience} with card •••• ${r.last4}.`);
    });

  const header = <Stack.Screen options={{ title: "Crew basket" }} />;

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
          title="Start a crew basket"
          body="Everyone keeps their own share inside it. It only pays for experiences, split evenly between whoever's going."
          actionLabel={busy === "start" ? "Starting…" : "Start a basket"}
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
        <Basket testID="pot-basket" size={88} progress={pot.balance / Math.max(split?.total || chipAmount * Math.max(shares?.length ?? 1, 1), 1)} />
        <Text style={type.eyebrow}>Your share of the basket</Text>
        <Text testID="pot-my-share" style={styles.shareValue}>
          {formatDollars(myShare)}
        </Text>
        <Text style={styles.muted}>
          {formatDollars(pot.balance)} of berries in the basket. Leftovers stay yours and roll over.
        </Text>
      </Card>

      {split ? (
        <SplitCard
          split={split}
          estimated={estimated}
          me={me}
          day={new Date(plan.window.start).toLocaleDateString(undefined, { weekday: "long" })}
          title={winner ? cleanTitle(winner.title) : "The experience"}
          busy={busy}
          receipt={receipt}
          onTopUp={(amount) => addToShare(amount, "topup")}
          onPay={pay}
        />
      ) : winner ? (
        <Card testID="pot-not-experience" tone="muted">
          <Text style={styles.muted}>{cleanTitle(winner.title)} isn't a bookable experience, so the basket isn't charged. Everyone pays their own way.</Text>
        </Card>
      ) : null}

      {actionError ? <ActionError message={actionError} /> : null}

      <WhopCard crewName={crewName} balance={pot.balance} goal={split?.total || pot.balance} last4={cardView?.card.last4} limit={cardView?.limit ?? pot.balance} spent={split?.charged || receipt ? split?.total ?? 0 : undefined} />
      {cardView === null ? (
        <Button
          testID="pot-issue-card-button"
          label="Issue card"
          icon="💳"
          variant="secondary"
          loading={busy === "issue"}
          disabled={!!busy}
          onPress={() => run("issue", async () => void (await issueCard({ groupId: plan.groupId })))}
        />
      ) : null}

      <Button
        testID="pot-chip-in-button"
        label={`Add ${formatDollars(chipAmount)} of berries`}
        variant={split && !split.charged ? "secondary" : "primary"}
        loading={busy === "chip"}
        disabled={!!busy}
        onPress={() => addToShare(chipAmount, "chip")}
      />
      
      <SectionHeader title="Everyone's share" testID="pot-shares-title" />
      <View testID="pot-shares" style={styles.list}>
        {(shares ?? []).map((s, i) => (
          <View key={s.userId} testID={`pot-share-${i}`} style={styles.row}>
            <Avatar name={s.name} avatar={avatarOf(s.userId)} />
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
        <EmptyState testID="pot-contributors-empty" emoji="🧺" title="No berries yet" body="Add to your share and the crew can book its first experience." />
      ) : (
        <View testID="pot-contributors" style={styles.list}>
          {chipIns.map((s, i) => (
            <View key={s.userId} testID={`pot-contributor-${i}`} style={styles.row}>
              <Avatar name={s.name} avatar={avatarOf(s.userId)} />
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

      {receipt ? <BerryBurst testID="pot-confetti" count={36} /> : null}
    </Screen>
  );
}

function SplitCard({
  split,
  estimated,
  me,
  day,
  title,
  busy,
  receipt,
  onTopUp,
  onPay,
}: {
  split: PlanSplit;
  estimated: boolean;
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
              <Button testID="pot-top-up" label={`Top up the basket ${formatDollars(mine.shortBy)}`} loading={busy === "topup"} disabled={!!busy} onPress={() => onTopUp(mine.shortBy)} />
                          </>
          ) : null}
          <Button
            testID="pot-pay"
            label="Pay from the basket"
            variant={mine && mine.shortBy > 0 ? "secondary" : "primary"}
            loading={busy === "pay"}
            disabled={!!busy || !split.allCovered}
            onPress={onPay}
          />
          {estimated ? (
            <Text testID="pot-split-confirm-hint" style={[styles.muted, { textAlign: "center" }]}>Ask your crew to confirm they're going. The basket pays once everyone's in.</Text>
          ) : !split.allCovered ? (
            <Text style={[styles.muted, { textAlign: "center" }]}>Unlocks once everyone's covered.</Text>
          ) : null}
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

function Avatar({ name, avatar, sponsor }: { name: string; avatar?: string; sponsor?: boolean }) {
  return (
    <View style={[styles.avatar, sponsor && { backgroundColor: colors.warningSoft }]}>
      <Text style={styles.avatarText}>{sponsor ? name : avatarFor({ name, avatarUrl: avatar })}</Text>
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
