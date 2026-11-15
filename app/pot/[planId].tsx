import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useAction, useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import SponsoredBadge from "../../components/SponsoredBadge";
import WhopCard from "../../components/WhopCard";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { colors, font, radius, spacing } from "../../constants/theme";
import { mockDelay, useMockQuery } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;
const SHOW_CARD_DETAILS = true;
const DEFAULT_PER_MEMBER = 20;

type Member = { _id: Id<"users">; name: string; avatarUrl?: string };
type PlanForPot = { _id: Id<"plans">; groupId: Id<"groups">; group: { _id: Id<"groups">; name: string; members: Member[] } };
type Transaction = {
  _id: Id<"transactions">;
  _creationTime: number;
  potId: Id<"pots">;
  type: "contribution" | "spend" | "refund";
  amount: number;
  userId?: Id<"users">;
  experienceId?: Id<"experiences">;
  planId?: Id<"plans">;
  whopPaymentId?: string;
  status: "pending" | "completed" | "failed";
  note?: string;
};
type PotView = { balance: number; monthlyContribution: number; paidThisMonth: Id<"users">[]; transactions: Transaction[] };
type CardDoc = { _id: Id<"cards">; groupId: Id<"groups">; last4: string; status: "mock-active" | "active" | "frozen"; whopCardId?: string };
type CardView = { card: CardDoc; groupName: string; limit: number };

const getPlanRef = makeFunctionReference<"query", { planId: Id<"plans"> }, PlanForPot | null>("plans:getPlan");
// TODO(I-7): swap to api.funds.getPot once funds.ts merges
const getPotRef = makeFunctionReference<"query", { groupId: Id<"groups"> }, PotView | null>("funds:getPot");
// TODO(I-7): swap to api.funds.createPot once funds.ts merges
const createPotRef = makeFunctionReference<"mutation", { groupId: Id<"groups">; monthlyContribution: number }, Id<"pots">>("funds:createPot");
// TODO(#7): swap to api.cards.getCard once cards.ts merges
const getCardRef = makeFunctionReference<"query", { groupId: Id<"groups"> }, CardView | null>("cards:getCard");
// TODO(#7): cards.issueCard is an internalMutation in #7; it needs a public wrapper before USE_MOCK = false
const issueCardRef = makeFunctionReference<"mutation", { groupId: Id<"groups"> }, Id<"cards">>("cards:issueCard");
// TODO(#7): swap to api.whop.createContributionCheckout once whop.ts merges
const checkoutRef = makeFunctionReference<"action", { userId: Id<"users">; groupId: Id<"groups">; amount: number }, string>(
  "whop:createContributionCheckout",
);

const ME = "user-uma" as Id<"users">;
const MOCK_GROUP_ID = "group-hack-crew" as Id<"groups">;
const MOCK_POT_ID = "pot-hack-crew" as Id<"pots">;
const MOCK_MEMBERS: Member[] = [
  { _id: ME, name: "Uma" },
  { _id: "user-ishan" as Id<"users">, name: "Ishan" },
  { _id: "user-gauri" as Id<"users">, name: "Gauri" },
];

function mockTransaction(id: string, amount: number, userId?: Id<"users">, note?: string): Transaction {
  return {
    _id: id as Id<"transactions">,
    _creationTime: Date.now(),
    potId: MOCK_POT_ID,
    type: "contribution",
    amount,
    userId,
    status: "completed",
    note,
    whopPaymentId: `pay_sandbox_${id}`,
  };
}

const MOCK_POT: PotView = {
  balance: 45,
  monthlyContribution: DEFAULT_PER_MEMBER,
  paidThisMonth: ["user-ishan" as Id<"users">, "user-gauri" as Id<"users">],
  transactions: [
    mockTransaction("tx-3", 15, "user-gauri" as Id<"users">),
    mockTransaction("tx-2", 10, undefined, "Boba Guys"),
    mockTransaction("tx-1", 20, "user-ishan" as Id<"users">),
  ],
};

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
  const me = USE_MOCK ? ME : (userId as Id<"users"> | null);

  const [mockPot, setMockPot] = useState<PotView | null>(MOCK_POT);
  const [mockCard, setMockCard] = useState<CardView | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "chip" | "issue" | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const wasFunded = useRef<boolean | null>(null);

  const livePlan = useQuery(getPlanRef, USE_MOCK || !planId ? "skip" : { planId: pid });
  const mockPlan = useMockQuery<PlanForPot | null>(
    { _id: pid, groupId: MOCK_GROUP_ID, group: { _id: MOCK_GROUP_ID, name: "Hack Crew", members: MOCK_MEMBERS } },
    USE_MOCK,
    400,
  );
  const plan = USE_MOCK ? mockPlan : livePlan;
  const groupId = plan?.groupId;

  const livePot = useQuery(getPotRef, USE_MOCK || !groupId ? "skip" : { groupId });
  const liveCard = useQuery(getCardRef, USE_MOCK || !groupId ? "skip" : { groupId });
  const mockLoaded = useMockQuery(true, USE_MOCK, 600);
  const pot = USE_MOCK ? (mockLoaded ? mockPot : undefined) : livePot;
  const cardView = USE_MOCK ? (mockLoaded ? mockCard : undefined) : liveCard;

  const createPotLive = useMutation(createPotRef);
  const issueCardLive = useMutation(issueCardRef);
  const checkoutLive = useAction(checkoutRef);

  const members = plan?.group.members ?? [];
  const memberCount = Math.max(members.length, 1);
  const perMember = pot?.monthlyContribution || DEFAULT_PER_MEMBER;
  const goal = memberCount * perMember;
  const chipAmount = Math.ceil(goal / memberCount);
  const balance = pot?.balance ?? 0;
  const funded = !!pot && balance >= goal;

  useEffect(() => {
    if (!pot) return;
    const previous = wasFunded.current;
    wasFunded.current = funded;
    if (previous === false && funded) {
      setShowConfetti(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [pot, funded]);

  const run = async (kind: "start" | "chip" | "issue", fn: () => Promise<void>) => {
    setActionError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const startPot = () =>
    run("start", async () => {
      if (!groupId) return;
      if (!USE_MOCK) {
        await createPotLive({ groupId, monthlyContribution: DEFAULT_PER_MEMBER });
        return;
      }
      await mockDelay(null, 500);
      setMockPot({ balance: 0, monthlyContribution: DEFAULT_PER_MEMBER, paidThisMonth: [], transactions: [] });
    });

  const chipIn = () =>
    run("chip", async () => {
      if (!groupId) return;
      if (!me) throw new Error("Sign in to chip in.");
      const url = USE_MOCK
        ? await mockDelay(`https://sandbox.whop.com/checkout/mock?amount=${chipAmount}`, 500)
        : await checkoutLive({ userId: me, groupId, amount: chipAmount });
      await WebBrowser.openBrowserAsync(url);
      if (!USE_MOCK) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setMockPot((p) =>
        p
          ? {
              ...p,
              balance: p.balance + chipAmount,
              paidThisMonth: [...p.paidThisMonth, me],
              transactions: [mockTransaction(`tx-${Date.now()}`, chipAmount, me), ...p.transactions],
            }
          : p,
      );
    });

  const issueCard = () =>
    run("issue", async () => {
      if (!groupId) return;
      if (!USE_MOCK) {
        await issueCardLive({ groupId });
        return;
      }
      await mockDelay(null, 1200);
      const last4 = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
      setMockCard({ card: { _id: "card-mock" as Id<"cards">, groupId, last4, status: "mock-active" }, groupName: "Hack Crew", limit: balance });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });

  if (plan === undefined || (plan && (pot === undefined || cardView === undefined))) {
    return (
      <Screen testID="pot-screen">
        <Stack.Screen options={{ title: "Crew pot" }} />
        <LoadingState label="Loading pot…" testID="pot-loading" />
      </Screen>
    );
  }
  if (plan === null) {
    return (
      <Screen testID="pot-screen">
        <Stack.Screen options={{ title: "Crew pot" }} />
        <ErrorState testID="pot-error" message="We couldn't find that plan." />
      </Screen>
    );
  }

  const crewName = plan.group.name || "Your crew";

  if (!pot) {
    return (
      <Screen testID="pot-screen">
        <Stack.Screen options={{ title: "Crew pot" }} />
        <Title testID="pot-title">{crewName}</Title>
        <EmptyState
          testID="pot-empty"
          actionTestID="pot-start-button"
          emoji="💸"
          title="Start a pot"
          body={`Everyone chips in $${DEFAULT_PER_MEMBER}, and the crew gets one Whop card to pay for the plan.`}
          actionLabel={busy === "start" ? "Starting…" : "Start a pot"}
          onAction={busy ? undefined : startPot}
        />
        {actionError ? <ActionError message={actionError} /> : null}
      </Screen>
    );
  }

  const card = cardView?.card;
  const ready = funded && !!card;
  const contributors = summarizeContributors(pot.transactions, members);
  const contributedIds = new Set(contributors.map((c) => c.userId));
  const waitingOn = members.filter((m) => !contributedIds.has(m._id));
  const iChippedIn = !!me && (pot.paidThisMonth.includes(me) || contributedIds.has(me));
  const progress = Math.min(balance / goal, 1);

  return (
    <Screen testID="pot-screen">
      <Stack.Screen options={{ title: "Crew pot" }} />
      <Title testID="pot-title">{crewName}</Title>
      <Subtitle testID="pot-subtitle">
        {ready ? "Your crew card is ready to spend." : funded ? "Pot's full. Issue the crew card." : `Pool $${goal} and the crew gets one Whop card.`}
      </Subtitle>

      <WhopCard crewName={crewName} balance={balance} goal={goal} last4={card?.last4} limit={cardView?.limit ?? balance} sandbox />

      <Card testID="pot-progress-card">
        <View style={styles.progressHeader}>
          <Text testID="pot-balance" style={styles.balance}>
            ${balance}
            <Text style={styles.goal}> of ${goal}</Text>
          </Text>
          <Text testID="pot-remaining" style={[styles.remaining, funded && { color: colors.success }]}>
            {funded ? "Funded 🎉" : `$${goal - balance} to go`}
          </Text>
        </View>
        <View testID="pot-progress-bar" style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }, funded && { backgroundColor: colors.success }]} />
        </View>
      </Card>

      {!funded ? (
        <Button
          testID="pot-chip-in-button"
          label={iChippedIn ? `Chip in another $${chipAmount}` : `Chip in $${chipAmount}`}
          icon="💸"
          loading={busy === "chip"}
          disabled={!!busy}
          onPress={chipIn}
        />
      ) : null}

      {funded && !card ? (
        <Button
          testID="pot-issue-card-button"
          label={busy === "issue" ? "Issuing card..." : "Issue card"}
          icon="💳"
          disabled={!!busy}
          onPress={issueCard}
        />
      ) : null}

      {ready && card && SHOW_CARD_DETAILS ? (
        <>
          <Button
            testID="pot-show-details-button"
            label={showDetails ? "Hide card details" : "Show card details"}
            variant="secondary"
            onPress={() => setShowDetails((s) => !s)}
          />
          {showDetails ? <CardDetails card={card} crewName={crewName} limit={cardView?.limit ?? balance} /> : null}
        </>
      ) : null}

      {actionError ? <ActionError message={actionError} /> : null}

      <SectionHeader title="Who's chipped in" testID="pot-contributors-title" />
      {contributors.length === 0 ? (
        <EmptyState testID="pot-contributors-empty" emoji="🫙" title="No chip-ins yet" body="Be the first to put money in the pot." />
      ) : (
        <View testID="pot-contributors" style={{ gap: spacing.sm }}>
          {contributors.map((c, i) => (
            <Card key={c.key} testID={`pot-contributor-${i}`} style={styles.row}>
              <Avatar name={c.name} avatarUrl={c.avatarUrl} sponsor={c.sponsor} />
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text testID={`pot-contributor-${i}-name`} style={styles.name} numberOfLines={1}>
                  {c.name}
                  {c.userId === me ? " (you)" : ""}
                </Text>
                {c.sponsor ? <SponsoredBadge testID={`pot-contributor-${i}-sponsored`} /> : null}
              </View>
              <Text testID={`pot-contributor-${i}-amount`} style={[styles.amount, c.sponsor && styles.sponsorAmount]}>
                {c.sponsor ? `chipped in $${c.amount}` : `$${c.amount}`}
              </Text>
            </Card>
          ))}
          {waitingOn.map((m) => (
            <View key={m._id} testID={`pot-waiting-${m._id}`} style={[styles.row, styles.waiting]}>
              <Avatar name={m.name} avatarUrl={m.avatarUrl} />
              <Text style={[styles.name, { flex: 1, color: colors.textMuted }]} numberOfLines={1}>
                {m.name}
                {m._id === me ? " (you)" : ""}
              </Text>
              <Text style={styles.waitingText}>not yet</Text>
            </View>
          ))}
        </View>
      )}

      {showConfetti ? <ConfettiCannon testID="pot-confetti" count={140} origin={{ x: -10, y: 0 }} fadeOut autoStart /> : null}
    </Screen>
  );
}

function CardDetails({ card, crewName, limit }: { card: CardDoc; crewName: string; limit: number }) {
  const rows: [string, string, string][] = [
    ["number", "Card number", `•••• •••• •••• ${card.last4}`],
    ["holder", "Card holder", crewName],
    ["limit", "Spend limit", `$${limit}`],
    ["status", "Status", card.status === "mock-active" ? "Active (sandbox mock)" : card.status],
  ];
  return (
    <Card testID="pot-card-details" tone="muted" style={{ gap: spacing.md }}>
      {rows.map(([key, label, value]) => (
        <View key={key} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{label}</Text>
          <Text testID={`pot-card-details-${key}`} style={styles.detailValue}>
            {value}
          </Text>
        </View>
      ))}
      <Text testID="pot-card-details-note" style={styles.detailNote}>
        Card issuing runs in Whop's sandbox and is mocked until card access is verified.
      </Text>
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

function Avatar({ name, avatarUrl, sponsor }: { name: string; avatarUrl?: string; sponsor?: boolean }) {
  if (avatarUrl) return <Image source={{ uri: avatarUrl }} style={styles.avatar} />;
  return (
    <View style={[styles.avatar, sponsor && { backgroundColor: colors.warningSoft }]}>
      <Text style={styles.avatarText}>{sponsor ? "⭐" : name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

type Contributor = { key: string; userId?: Id<"users">; name: string; avatarUrl?: string; amount: number; sponsor: boolean };

function summarizeContributors(transactions: Transaction[], members: Member[]): Contributor[] {
  const byKey = new Map<string, Contributor>();
  for (const t of transactions) {
    if (t.type !== "contribution" || t.status !== "completed") continue;
    const member = t.userId ? members.find((m) => m._id === t.userId) : undefined;
    const sponsor = !t.userId;
    const key = t.userId ?? `sponsor:${t.note ?? "sponsor"}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.amount += t.amount;
      continue;
    }
    byKey.set(key, {
      key,
      userId: t.userId,
      name: sponsor ? (t.note ?? "A local sponsor") : (member?.name ?? "A friend"),
      avatarUrl: member?.avatarUrl,
      amount: t.amount,
      sponsor,
    });
  }
  return [...byKey.values()].sort((a, b) => b.amount - a.amount);
}

const styles = StyleSheet.create({
  progressHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.md },
  balance: { fontSize: font.size.hero, fontWeight: font.weight.heavy, color: colors.text },
  goal: { fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.textMuted },
  remaining: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.accent },
  track: { height: 14, borderRadius: radius.pill, backgroundColor: colors.cardMuted, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.accent },
  error: { color: colors.danger, fontSize: font.size.sm, fontWeight: font.weight.semibold, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  waiting: { borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
  waitingText: { fontSize: font.size.sm, color: colors.textMuted, fontWeight: font.weight.semibold },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.accentDark },
  name: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  amount: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.text },
  sponsorAmount: { fontSize: font.size.sm, color: colors.warning },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  detailLabel: { fontSize: font.size.sm, color: colors.textMuted, fontWeight: font.weight.semibold },
  detailValue: { fontSize: font.size.sm, color: colors.text, fontWeight: font.weight.bold, fontVariant: ["tabular-nums"] },
  detailNote: { fontSize: font.size.xs, color: colors.textMuted, lineHeight: 18 },
});
