import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { formatWindow } from "../../lib/format";
import { mockDelay, useMockQuery } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;

type TimeBlock = { start: number; end: number };
type PlanStatus = "generating" | "voting" | "locked" | "done" | "cancelled";
type PlanOption = { placeId: Id<"places">; title: string; costMin: number; costMax: number; why: string; travel?: string; sponsorId?: Id<"sponsors"> };
type Plan = {
  _id: Id<"plans">;
  _creationTime: number;
  groupId: Id<"groups">;
  window: TimeBlock;
  status: PlanStatus;
  options: PlanOption[];
  winningIndex?: number;
  confirmBy: number;
};
type Member = { _id: Id<"users">; name: string; avatarUrl?: string };
type GroupDetail = {
  _id: Id<"groups">;
  _creationTime: number;
  name: string;
  inviteCode: string;
  ownerId: Id<"users">;
  memberIds: Id<"users">[];
  members: Member[];
};

// TODO(convex): swap to api.groups.getGroup once it lands
const getGroupRef = makeFunctionReference<"query", { groupId: Id<"groups"> }, GroupDetail | null>("groups:getGroup");
// TODO(convex): swap to api.availability.findFreeWindows once it lands
const findFreeWindowsRef = makeFunctionReference<"query", { groupId: Id<"groups">; from: number; to: number; minHours: number }, TimeBlock[]>(
  "availability:findFreeWindows",
);
// TODO(convex): swap to api.plans.getGroupPlans once it lands
const getGroupPlansRef = makeFunctionReference<"query", { groupId: Id<"groups"> }, Plan[]>("plans:getGroupPlans");
// TODO(convex): swap to api.plans.createPlan once it lands
const createPlanRef = makeFunctionReference<"mutation", { userId: Id<"users">; groupId: Id<"groups">; window: TimeBlock }, Id<"plans">>(
  "plans:createPlan",
);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function atHour(dayOffset: number, hour: number): number {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

const MOCK_MEMBERS: Member[] = [
  { _id: "user-uma" as Id<"users">, name: "Uma" },
  { _id: "user-ishan" as Id<"users">, name: "Ishan" },
  { _id: "user-gauri" as Id<"users">, name: "Gauri" },
];
const MOCK_GROUP: GroupDetail = {
  _id: "group-hack-crew" as Id<"groups">,
  _creationTime: Date.now() - 14 * DAY,
  name: "Hack Crew",
  inviteCode: "GOJI42",
  ownerId: "user-uma" as Id<"users">,
  memberIds: MOCK_MEMBERS.map((m) => m._id),
  members: MOCK_MEMBERS,
};
const mockOption = (title: string, costMin: number, costMax: number, why: string, placeId: string): PlanOption => ({
  placeId: placeId as Id<"places">,
  title,
  costMin,
  costMax,
  why,
});
const MOCK_PLANS: Plan[] = [
  {
    _id: "plan-locked-1" as Id<"plans">,
    _creationTime: Date.now() - DAY,
    groupId: MOCK_GROUP._id,
    window: { start: atHour(3, 18), end: atHour(3, 21) },
    status: "locked",
    options: [mockOption("Karaoke at Pink Elephant", 15, 35, "Everyone wanted something social.", "place-1")],
    winningIndex: 0,
    confirmBy: Date.now() + 2 * DAY,
  },
  {
    _id: "plan-done-1" as Id<"plans">,
    _creationTime: Date.now() - 12 * DAY,
    groupId: MOCK_GROUP._id,
    window: { start: atHour(-9, 18), end: atHour(-9, 21) },
    status: "done",
    options: [mockOption("Escape room at Exit Strategy", 25, 40, "Puzzle lovers unite.", "place-2")],
    winningIndex: 0,
    confirmBy: Date.now() - 10 * DAY,
  },
  {
    _id: "plan-cancelled-1" as Id<"plans">,
    _creationTime: Date.now() - 20 * DAY,
    groupId: MOCK_GROUP._id,
    window: { start: atHour(-17, 12), end: atHour(-17, 15) },
    status: "cancelled",
    options: [mockOption("Hike at Lands End", 0, 5, "Fresh air and ocean views.", "place-3")],
    confirmBy: Date.now() - 18 * DAY,
  },
];

const STATUS_LABEL: Record<PlanStatus, string> = {
  generating: "Cooking…",
  voting: "Voting",
  locked: "Locked in",
  done: "Done",
  cancelled: "Cancelled",
};

export default function GroupScreen() {
  const router = useRouter();
  const { userId } = useUserId();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const gid = groupId as Id<"groups">;
  const [selected, setSelected] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = Date.now();
    return { from, to: from + 7 * DAY };
  }, []);

  const mockWindows = useMemo<TimeBlock[]>(
    () => [
      { start: atHour(2, 18), end: atHour(2, 22) },
      { start: atHour(3, 18), end: atHour(3, 21) },
      { start: atHour(5, 12), end: atHour(5, 16) },
    ],
    [],
  );

  const liveGroup = useQuery(getGroupRef, USE_MOCK || !groupId ? "skip" : { groupId: gid });
  const liveWindows = useQuery(findFreeWindowsRef, USE_MOCK || !groupId ? "skip" : { groupId: gid, ...range, minHours: 2 });
  const livePlans = useQuery(getGroupPlansRef, USE_MOCK || !groupId ? "skip" : { groupId: gid });
  const mockGroup = useMockQuery<GroupDetail | null>(MOCK_GROUP, USE_MOCK);
  const mockWin = useMockQuery(mockWindows, USE_MOCK, 900);
  const mockPlans = useMockQuery(MOCK_PLANS, USE_MOCK, 800);
  const group = USE_MOCK ? mockGroup : liveGroup;
  const windows = USE_MOCK ? mockWin : liveWindows;
  const plans = USE_MOCK ? mockPlans : livePlans;

  const createLive = useMutation(createPlanRef);
  const createPlan = USE_MOCK
    ? (args: { userId: Id<"users">; groupId: Id<"groups">; window: TimeBlock }) => mockDelay("plan-mock-new" as Id<"plans">, 700)
    : createLive;

  const planOuting = async () => {
    if (selected === null || !windows) return;
    setPlanning(true);
    setPlanError(null);
    try {
      const planId = await createPlan({ userId: (userId ?? "user-uma") as Id<"users">, groupId: gid, window: windows[selected] });
      router.push(`/plan/${planId}`);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Couldn't start a plan.");
    } finally {
      setPlanning(false);
    }
  };

  if (group === undefined) {
    return (
      <Screen testID="group-screen">
        <Stack.Screen options={{ title: "Group" }} />
        <LoadingState label="Loading group…" testID="group-loading" />
      </Screen>
    );
  }
  if (group === null) {
    return (
      <Screen testID="group-screen">
        <Stack.Screen options={{ title: "Group" }} />
        <ErrorState testID="group-error" message="We couldn't find that group." />
      </Screen>
    );
  }

  const upcoming = (plans ?? []).filter((p) => p.status !== "done" && p.status !== "cancelled");
  const past = (plans ?? []).filter((p) => p.status === "done" || p.status === "cancelled");
  const planTitle = (p: Plan) => (p.winningIndex !== undefined ? p.options[p.winningIndex]?.title : undefined) ?? "Outing ideas";
  const renderPlan = (p: Plan, i: number) => (
    <Card key={p._id} testID={`plan-card-${i}`} onPress={() => router.push(`/plan/${p._id}`)} style={styles.planCard}>
      <View style={styles.planInfo}>
        <Text testID={`plan-title-${i}`} style={styles.planTitle}>
          {planTitle(p)}
        </Text>
        <Text style={styles.planWindow}>{formatWindow(p.window)}</Text>
      </View>
      <View testID={`plan-status-${i}`} style={[styles.pill, p.status === "locked" && styles.pillSuccess, p.status === "cancelled" && styles.pillDanger]}>
        <Text style={styles.pillText}>{STATUS_LABEL[p.status]}</Text>
      </View>
    </Card>
  );

  return (
    <Screen testID="group-screen">
      <Stack.Screen options={{ title: group.name }} />
      <Title testID="group-title">{group.name}</Title>

      <View testID="member-row" style={styles.members}>
        {group.members.map((m, i) => (
          <View key={m._id} style={styles.member}>
            <View testID={`member-avatar-${i}`} style={styles.avatar}>
              <Text style={styles.avatarText}>{m.name.charAt(0).toUpperCase()}</Text>
            </View>
            <Text testID={`member-name-${i}`} style={styles.memberName}>
              {m.name}
            </Text>
          </View>
        ))}
      </View>

      <View testID="invite-code-chip" style={styles.inviteChip}>
        <Text style={styles.inviteLabel}>Invite code</Text>
        <Text testID="group-invite-code" style={styles.inviteCode} selectable>
          {group.inviteCode}
        </Text>
      </View>

      <SectionHeader title="Free windows" testID="free-windows-header" />
      {windows === undefined ? (
        <LoadingState label="Finding times that work…" testID="windows-loading" />
      ) : windows.length === 0 ? (
        <EmptyState testID="windows-empty" emoji="📅" title="No shared free time" body="Nothing 2+ hours long in the next 7 days. Check back soon." />
      ) : (
        windows.map((win, i) => (
          <Card
            key={win.start}
            testID={`free-window-${i}`}
            tone={selected === i ? "accent" : "default"}
            onPress={() => setSelected(i)}
            style={styles.windowCard}
          >
            <Text style={styles.windowText}>{formatWindow(win)}</Text>
            <Text style={styles.windowCheck}>{selected === i ? "✓" : ""}</Text>
          </Card>
        ))
      )}
      {planError ? <ErrorState testID="plan-error" message={planError} onRetry={planOuting} /> : null}
      <Button
        testID="plan-outing-button"
        label="Plan an outing"
        icon="🍓"
        loading={planning}
        disabled={selected === null}
        onPress={planOuting}
      />

      <SectionHeader title="Upcoming plans" testID="upcoming-header" />
      {plans === undefined ? (
        <LoadingState label="Loading plans…" testID="plans-loading" />
      ) : upcoming.length === 0 ? (
        <EmptyState testID="plans-empty" emoji="🗓️" title="No plans yet" body="Pick a free window and plan your first outing." />
      ) : (
        upcoming.map(renderPlan)
      )}

      {past.length > 0 ? (
        <>
          <SectionHeader title="Past plans" testID="past-header" />
          {past.map((p, i) => renderPlan(p, upcoming.length + i))}
        </>
      ) : null}

      <Card testID="story-link" tone="muted" onPress={() => router.push(`/story/${groupId}`)} style={styles.planCard}>
        <View style={styles.planInfo}>
          <Text style={styles.planTitle}>📸 Group story</Text>
          <Text style={styles.planWindow}>Photos from your outings</Text>
        </View>
        <Text style={styles.windowCheck}>›</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  members: { flexDirection: "row", gap: spacing.lg },
  member: { alignItems: "center", gap: spacing.xs },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark },
  memberName: { fontSize: font.size.sm, color: colors.textMuted, fontWeight: font.weight.semibold },
  inviteChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTapTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.cardMuted,
  },
  inviteLabel: { fontSize: font.size.sm, color: colors.textMuted },
  inviteCode: { fontSize: font.size.md, fontWeight: font.weight.heavy, letterSpacing: 2, color: colors.accentDark },
  windowCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 64, borderWidth: 2 },
  windowText: { fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.text, flex: 1 },
  windowCheck: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accent },
  planCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 64 },
  planInfo: { flex: 1, gap: spacing.xs },
  planTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  planWindow: { fontSize: font.size.sm, color: colors.textMuted },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.warningSoft },
  pillSuccess: { backgroundColor: colors.successSoft },
  pillDanger: { backgroundColor: colors.dangerSoft },
  pillText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.text },
});
