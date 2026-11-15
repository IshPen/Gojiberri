import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useAction, useMutation, useQuery } from "convex/react";
import ConfettiCannon from "react-native-confetti-cannon";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import OptionCard from "../../components/OptionCard";
import { Button, Card, ErrorState, LoadingState, Screen, Subtitle, Title } from "../../components/ui";
import { colors, font, radius, spacing } from "../../constants/theme";
import { createInvite } from "../../lib/calendar";
import { formatCountdown, formatGojis, formatWindow } from "../../lib/format";
import { mockDelay, useMockQuery } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;

type TimeBlock = { start: number; end: number };
type PlanStatus = "generating" | "voting" | "locked" | "done" | "cancelled";
type PlanOption = { placeId: Id<"places">; title: string; costMin: number; costMax: number; why: string; travel?: string; sponsorId?: Id<"sponsors"> };
type Vote = { _id: Id<"votes">; userId: Id<"users">; planId: Id<"plans">; optionIndex: number; confirmed: boolean };
type Place = {
  _id: Id<"places">;
  name: string;
  area: string;
  category: string;
  priceLevel: number;
  tags: string[];
  lat: number;
  lng: number;
  durationMins: number;
  bookingUrl?: string;
};
type PlanDetail = {
  _id: Id<"plans">;
  groupId: Id<"groups">;
  window: TimeBlock;
  status: PlanStatus;
  options: PlanOption[];
  winningIndex?: number;
  confirmBy: number;
  votes: Vote[];
  counts: number[];
  places: Place[];
};

// TODO(convex): swap to api.plans.getPlan once it lands
const getPlanRef = makeFunctionReference<"query", { planId: Id<"plans"> }, PlanDetail | null>("plans:getPlan");
// TODO(convex): swap to api.groups.getGroup once it lands
const getGroupRef = makeFunctionReference<"query", { groupId: Id<"groups"> }, { members: { _id: Id<"users">; name: string }[] } | null>("groups:getGroup");
// TODO(convex): swap to api.votes.castVote once it lands
const castVoteRef = makeFunctionReference<"mutation", { userId: Id<"users">; planId: Id<"plans">; optionIndex: number }, null>("votes:castVote");
// TODO(convex): swap to api.votes.confirmAttendance once it lands
const confirmRef = makeFunctionReference<"mutation", { userId: Id<"users">; planId: Id<"plans"> }, null>("votes:confirmAttendance");
// TODO(convex): swap to api.whop.createDeposit once it lands
const createDepositRef = makeFunctionReference<"action", { userId: Id<"users">; planId: Id<"plans"> }, string>("whop:createDeposit");

const ME = "user-uma" as Id<"users">;
const MOCK_GROUP_ID = "group-hack-crew" as Id<"groups">;
const MOCK_MEMBERS = [
  { _id: ME, name: "Uma" },
  { _id: "user-ishan" as Id<"users">, name: "Ishan" },
  { _id: "user-gauri" as Id<"users">, name: "Gauri" },
];
const MOCK_PLACES: Place[] = [
  {
    _id: "place-1" as Id<"places">,
    name: "Pink Elephant Karaoke",
    area: "Mission",
    category: "activity",
    priceLevel: 2,
    tags: ["social", "music"],
    lat: 37.76,
    lng: -122.42,
    durationMins: 120,
    bookingUrl: "https://example.com/book/pink-elephant",
  },
  {
    _id: "place-2" as Id<"places">,
    name: "Exit Strategy Escape Rooms",
    area: "SoMa",
    category: "activity",
    priceLevel: 3,
    tags: ["puzzle", "team"],
    lat: 37.78,
    lng: -122.4,
    durationMins: 90,
    bookingUrl: "https://example.com/book/exit-strategy",
  },
  {
    _id: "place-3" as Id<"places">,
    name: "Dolores Park Picnic",
    area: "Mission Dolores",
    category: "outdoors",
    priceLevel: 1,
    tags: ["chill", "outdoors"],
    lat: 37.76,
    lng: -122.427,
    durationMins: 150,
  },
];
const MOCK_OPTIONS: PlanOption[] = [
  { placeId: "place-1" as Id<"places">, title: "Karaoke at Pink Elephant", costMin: 15, costMax: 35, why: "Everyone's budget fits and you all wanted something loud and social.", travel: "12 min by transit" },
  {
    placeId: "place-2" as Id<"places">,
    title: "Escape room at Exit Strategy",
    costMin: 25,
    costMax: 40,
    why: "Gauri's 5-star puzzle pick from last time, perfect for a team of three.",
    travel: "18 min by transit",
    sponsorId: "sponsor-1" as Id<"sponsors">,
  },
  { placeId: "place-3" as Id<"places">, title: "Picnic at Dolores Park", costMin: 5, costMax: 15, why: "Cheap, sunny and easy to extend with tacos nearby.", travel: "8 min walk" },
];

const mockVote = (planId: string, userId: Id<"users">, optionIndex: number, confirmed = false): Vote => ({
  _id: `vote-${userId}` as Id<"votes">,
  userId,
  planId: planId as Id<"plans">,
  optionIndex,
  confirmed,
});

export default function PlanScreen() {
  const { userId } = useUserId();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const pid = planId as Id<"plans">;
  const me = (userId ?? ME) as Id<"users">;

  const initial: PlanStatus = planId?.startsWith("plan-locked") ? "locked" : planId?.startsWith("plan-done") ? "done" : planId?.startsWith("plan-cancelled") ? "cancelled" : "generating";
  const [mockStatus, setMockStatus] = useState<PlanStatus>(initial);
  const [mockVotes, setMockVotes] = useState<Vote[]>(
    initial === "locked" || initial === "done" ? [mockVote(planId ?? "", ME, 0), mockVote(planId ?? "", "user-ishan" as Id<"users">, 0)] : [],
  );
  const [mockWinning, setMockWinning] = useState<number | undefined>(initial === "locked" || initial === "done" ? 0 : undefined);
  const [confirmBy] = useState(() => Date.now() + 5 * 60 * 1000);
  const [now, setNow] = useState(Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [calendarAdded, setCalendarAdded] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevStatus = useRef<PlanStatus | null>(null);
  const inviteCreated = useRef(false);
  const confettiFired = useRef(false);

  useEffect(() => {
    if (!USE_MOCK || initial !== "generating") return;
    const timer = setTimeout(() => {
      setMockStatus("voting");
      setMockVotes([mockVote(planId ?? "", "user-ishan" as Id<"users">, 1), mockVote(planId ?? "", "user-gauri" as Id<"users">, 2)]);
    }, 1500);
    return () => clearTimeout(timer);
  }, [initial, planId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const mockCounts = MOCK_OPTIONS.map((_, i) => mockVotes.filter((v) => v.optionIndex === i).length);
  const mockPlan: PlanDetail = {
    _id: pid,
    groupId: MOCK_GROUP_ID,
    window: { start: Date.now() + 3 * 24 * 3600 * 1000, end: Date.now() + 3 * 24 * 3600 * 1000 + 3 * 3600 * 1000 },
    status: mockStatus,
    options: mockStatus === "generating" ? [] : MOCK_OPTIONS,
    winningIndex: mockWinning,
    confirmBy,
    votes: mockVotes,
    counts: mockCounts,
    places: MOCK_PLACES,
  };

  const livePlan = useQuery(getPlanRef, USE_MOCK || !planId ? "skip" : { planId: pid });
  const mockQuery = useMockQuery<PlanDetail | null>(mockPlan, USE_MOCK, 400);
  const plan = USE_MOCK ? mockQuery : livePlan;

  const liveGroup = useQuery(getGroupRef, USE_MOCK || !plan ? "skip" : { groupId: plan.groupId });
  const mockGroup = useMockQuery({ members: MOCK_MEMBERS }, USE_MOCK, 0);
  const group = USE_MOCK ? mockGroup : liveGroup;
  const total = group?.members.length ?? 0;

  const castLive = useMutation(castVoteRef);
  const castVote = USE_MOCK
    ? async (args: { userId: Id<"users">; planId: Id<"plans">; optionIndex: number }) => {
        await mockDelay(null, 200);
        const next = [...mockVotes.filter((v) => v.userId !== args.userId), mockVote(planId ?? "", args.userId, args.optionIndex)];
        setMockVotes(next);
        const winner = MOCK_OPTIONS.findIndex((_, i) => next.filter((v) => v.optionIndex === i).length >= 2);
        if (winner >= 0) {
          setMockWinning(winner);
          setMockStatus("locked");
        }
        return null;
      }
    : castLive;

  const confirmLive = useMutation(confirmRef);
  const confirmAttendance = USE_MOCK
    ? async (args: { userId: Id<"users">; planId: Id<"plans"> }) => {
        await mockDelay(null, 400);
        setMockVotes((votes) => votes.map((v) => (v.userId === args.userId ? { ...v, confirmed: true } : v)));
        return null;
      }
    : confirmLive;

  const depositLive = useAction(createDepositRef);
  const createDeposit = USE_MOCK ? (args: { userId: Id<"users">; planId: Id<"plans"> }) => mockDelay("https://whop.com/checkout/gojiberri-flake-deposit", 600) : depositLive;

  const status = plan?.status;
  const winningIndex = plan?.winningIndex;

  useEffect(() => {
    if (!plan || !status) return;
    const previous = prevStatus.current;
    prevStatus.current = status;
    if (status !== "locked" || previous === null || previous === "locked") return;
    if (!confettiFired.current) {
      confettiFired.current = true;
      setShowConfetti(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const winner = winningIndex !== undefined ? plan.options[winningIndex] : undefined;
    const place = winningIndex !== undefined ? plan.places[winningIndex] : undefined;
    if (!winner || !place || inviteCreated.current) return;
    inviteCreated.current = true;
    createInvite({ title: winner.title, window: plan.window }, { name: place.name, area: place.area, bookingUrl: place.bookingUrl })
      .then((eventId) => setCalendarAdded(!!eventId))
      .catch(() => {});
  }, [plan, status, winningIndex]);

  const vote = async (optionIndex: number) => {
    setActionError(null);
    try {
      await castVote({ userId: me, planId: pid, optionIndex });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't cast your vote.");
    }
  };

  const [confirming, setConfirming] = useState(false);
  const confirm = async () => {
    setActionError(null);
    setConfirming(true);
    try {
      await confirmAttendance({ userId: me, planId: pid });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't confirm.");
    } finally {
      setConfirming(false);
    }
  };

  const deposit = async () => {
    setActionError(null);
    setDepositLoading(true);
    try {
      const url = await createDeposit({ userId: me, planId: pid });
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't start the deposit.");
    } finally {
      setDepositLoading(false);
    }
  };

  if (plan === undefined) {
    return (
      <Screen testID="plan-screen">
        <Stack.Screen options={{ title: "Plan" }} />
        <LoadingState label="Loading plan…" testID="plan-loading" />
      </Screen>
    );
  }
  if (plan === null) {
    return (
      <Screen testID="plan-screen">
        <Stack.Screen options={{ title: "Plan" }} />
        <ErrorState testID="plan-error" message="We couldn't find that plan." />
      </Screen>
    );
  }

  const myVote = plan.votes.find((v) => v.userId === me);
  const winner = plan.winningIndex !== undefined ? plan.options[plan.winningIndex] : undefined;
  const winnerPlace = plan.winningIndex !== undefined ? plan.places[plan.winningIndex] : undefined;
  const locked = plan.status === "locked" || plan.status === "done";
  const votingOpen = plan.status === "voting";

  return (
    <Screen testID="plan-screen">
      <Stack.Screen options={{ title: "Plan" }} />
      <Title testID="plan-title">{plan.status === "generating" ? "Planning…" : "Pick the outing"}</Title>
      <Subtitle testID="plan-window">{formatWindow(plan.window)}</Subtitle>

      {plan.status === "generating" ? (
        <View testID="plan-generating" style={styles.gap}>
          <Text style={styles.cooking}>Cooking up 3 ideas…</Text>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} index={i} />
          ))}
        </View>
      ) : null}

      {plan.status === "cancelled" ? (
        <Card testID="cancelled-banner" tone="muted" style={styles.banner}>
          <Text style={styles.bannerTitle}>This plan was cancelled</Text>
          <Text style={styles.bannerBody}>Not enough votes came in. Start a new plan from the group page.</Text>
        </Card>
      ) : null}

      {locked && winner ? (
        <Card testID="lock-banner" tone="success" style={styles.banner}>
          <Text style={styles.bannerEmoji}>{plan.status === "done" ? "🎉" : "🔒"}</Text>
          <Text style={styles.bannerLabel}>{plan.status === "done" ? "Outing complete" : "It's locked!"}</Text>
          <Text testID="lock-winner-title" style={styles.bannerTitle}>
            {winner.title}
          </Text>
          {calendarAdded ? (
            <Text testID="calendar-added" style={styles.bannerBody}>
              Added to calendar ✓
            </Text>
          ) : null}
        </Card>
      ) : null}

      {votingOpen ? (
        <View style={styles.countdownRow}>
          <Text testID="confirm-countdown" style={styles.countdown}>
            ⏳ Voting closes in {formatCountdown(plan.confirmBy, now)}
          </Text>
        </View>
      ) : null}

      {plan.status !== "generating"
        ? plan.options.map((option, i) => (
            <OptionCard
              key={option.placeId}
              index={i}
              option={option}
              count={plan.counts[i] ?? 0}
              total={Math.max(total, 1)}
              selected={myVote?.optionIndex === i}
              winner={locked && plan.winningIndex === i}
              disabled={!votingOpen}
              onPress={() => vote(i)}
            />
          ))
        : null}

      {actionError ? <ErrorState testID="plan-action-error" message={actionError} /> : null}

      {plan.status === "locked" && myVote ? (
        <View style={styles.gap}>
          {myVote.confirmed ? (
            <Card testID="confirmed-badge" tone="success" style={styles.confirmed}>
              <Text style={styles.bannerTitle}>✓ You're confirmed</Text>
            </Card>
          ) : (
            <>
              <Button testID="confirm-attendance" label="Confirm I'm going" loading={confirming} onPress={confirm} />
              <Text testID="confirm-bonus" style={styles.bonus}>
                +{formatGojis(15)} if you confirm in time · {Math.max(0, Math.round((plan.confirmBy - now) / 60000))}m left
              </Text>
            </>
          )}
          <Button testID="deposit-button" label="$5 flake deposit" variant="secondary" loading={depositLoading} onPress={deposit} />
          {winnerPlace?.bookingUrl ? (
            <Button testID="booking-link" label="Book it" variant="secondary" onPress={() => Linking.openURL(winnerPlace.bookingUrl as string).catch(() => {})} />
          ) : null}
        </View>
      ) : null}

      {showConfetti ? <ConfettiCannon testID="confetti" count={120} origin={{ x: -10, y: 0 }} fadeOut autoStart /> : null}
    </Screen>
  );
}

function SkeletonCard({ index }: { index: number }) {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setPulse((p) => !p), 600);
    return () => clearInterval(timer);
  }, []);
  const bar = { backgroundColor: pulse ? colors.border : colors.cardMuted, borderRadius: radius.sm };
  return (
    <Card testID={`skeleton-card-${index}`} style={styles.gap}>
      <View style={[bar, { height: 24, width: "70%" }]} />
      <View style={[bar, { height: 16, width: "40%" }]} />
      <View style={[bar, { height: 16, width: "100%" }]} />
      <View style={[bar, { height: 12, width: "100%" }]} />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  cooking: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.accentDark, textAlign: "center" },
  banner: { alignItems: "center", gap: spacing.xs },
  bannerEmoji: { fontSize: 40 },
  bannerLabel: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.success, textTransform: "uppercase" },
  bannerTitle: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text, textAlign: "center" },
  bannerBody: { fontSize: font.size.md, color: colors.textMuted, textAlign: "center" },
  countdownRow: { alignItems: "center" },
  countdown: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.textMuted },
  confirmed: { alignItems: "center" },
  bonus: { textAlign: "center", color: colors.textMuted, fontSize: font.size.sm },
});
