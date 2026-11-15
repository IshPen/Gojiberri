import type { GenericId as Id } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { SchoolHeader } from "../../components/SchoolBadge";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { formatWindow } from "../../lib/format";
import { formatPts, schoolFor, withAlpha } from "../../lib/school";
import { useUserId } from "../../lib/session";

type Plan = FunctionReturnType<typeof api.plans.getGroupPlans>[number];

type TimeBlock = { start: number; end: number };
type PlanStatus = "generating" | "voting" | "locked" | "done" | "cancelled";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

  const liveArgs = groupId ? { groupId: gid } : "skip";
  const group = useQuery(api.groups.getGroup, liveArgs);
  const windows = useQuery(api.availability.findFreeWindows, groupId ? { groupId: gid, ...range, minHours: 2 } : "skip");
  const plans = useQuery(api.plans.getGroupPlans, liveArgs);
  const user = useQuery(api.users.getUser, userId ? { userId: userId as Id<"users"> } : "skip");
  const school = user?.homeArea ?? null;
  const board = useQuery(api.points.groupLeaderboard, school ? { school, limit: 50 } : "skip");
  const createPlan = useMutation(api.plans.createPlan);

  const planOuting = async () => {
    if (selected === null || !windows) return;
    if (!userId) {
      setPlanError("Finish joining your school first.");
      return;
    }
    setPlanning(true);
    setPlanError(null);
    try {
      const planId = await createPlan({ userId: userId as Id<"users">, groupId: gid, window: windows[selected] });
      router.push(`/plan/${planId}`);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Couldn't ask for suggestions. Try again.");
    } finally {
      setPlanning(false);
    }
  };

  if (group === undefined) {
    return (
      <Screen testID="group-screen">
        <Stack.Screen options={{ title: "Crew" }} />
        <LoadingState label="Loading your crew…" testID="group-loading" />
      </Screen>
    );
  }
  if (group === null) {
    return (
      <Screen testID="group-screen">
        <Stack.Screen options={{ title: "Crew" }} />
        <ErrorState testID="group-error" message="We couldn't find that crew." />
      </Screen>
    );
  }

  const upcoming = (plans ?? []).filter((p) => p.status !== "done" && p.status !== "cancelled");
  const past = (plans ?? []).filter((p) => p.status === "done" || p.status === "cancelled");
  const planTitle = (p: Plan) => (p.winningIndex !== undefined ? p.options[p.winningIndex]?.title : undefined) ?? "Outing ideas";
  const accent = schoolFor(school).color;
  const rankIndex = (board ?? []).findIndex((c) => c.groupId === group._id);
  const mine = rankIndex >= 0 ? board![rankIndex] : undefined;
  const ahead = rankIndex > 0 ? board![rankIndex - 1] : undefined;
  const behind = rankIndex >= 0 ? board![rankIndex + 1] : undefined;
  const standing =
    !school || board === undefined
      ? null
      : !mine
        ? `Check in on a group outing to put ${group.name} on the ${school} board.`
        : ahead
          ? `#${rankIndex + 1} at ${school} · ${ahead.name} is ${formatPts(Math.max(0, ahead.avgPoints - mine.avgPoints))} pts ahead`
          : behind
            ? `#1 at ${school} · ${formatPts(mine.avgPoints - behind.avgPoints)} pts ahead of ${behind.name}`
            : `#1 at ${school}. Hold the lead!`;
  const renderPlan = (p: Plan, i: number) => (
    <Card key={p._id} testID={`plan-card-${i}`} onPress={() => router.push(`/plan/${p._id}`)} style={styles.planCard}>
      <View style={styles.planInfo}>
        <Text testID={`plan-title-${i}`} style={styles.planTitle}>
          {p.status === "generating" ? "Cooking up 3 ideas…" : planTitle(p)}
        </Text>
        <Text style={styles.planWindow}>{formatWindow(p.window)}</Text>
        {p.status === "voting" && p.options.length > 0 ? (
          <Text testID={`plan-suggestions-${i}`} style={styles.planWindow} numberOfLines={2}>
            Vote: {p.options.map((o) => o.title).join(" · ")}
          </Text>
        ) : null}
      </View>
      <View testID={`plan-status-${i}`} style={[styles.pill, p.status === "locked" && styles.pillSuccess, p.status === "cancelled" && styles.pillDanger]}>
        <Text style={styles.pillText}>{STATUS_LABEL[p.status]}</Text>
      </View>
    </Card>
  );

  return (
    <Screen testID="group-screen">
      <Stack.Screen options={{ title: group.name }} />
      <SchoolHeader school={school} testID="group-school-header" />
      <Title testID="group-title">{group.name}</Title>
      {standing ? (
        <View testID="group-standing" style={[styles.standing, { backgroundColor: withAlpha(accent, 0.1) }]}>
          <Text testID="group-standing-text" style={[styles.standingText, { color: accent }]}>
            🏆 {standing}
          </Text>
        </View>
      ) : null}

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
        <EmptyState testID="windows-empty" emoji="📅" title="No shared free time" body="Nothing 2+ hours long in the next 7 days. Connect calendars or check back soon." />
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
        label="Get 3 outing ideas"
        icon="🍓"
        loading={planning}
        disabled={selected === null}
        onPress={planOuting}
      />

      <SectionHeader title="Upcoming plans" testID="upcoming-header" />
      {plans === undefined ? (
        <LoadingState label="Loading plans…" testID="plans-loading" />
      ) : upcoming.length === 0 ? (
        <EmptyState testID="plans-empty" emoji="🗓️" title="No plans yet" body={`Pick a free window and we'll suggest 3 outings your crew will like. Check in together to earn ${brand.points}.`} />
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
  standing: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  standingText: { fontSize: font.size.sm, fontWeight: font.weight.heavy },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.warningSoft },
  pillSuccess: { backgroundColor: colors.successSoft },
  pillDanger: { backgroundColor: colors.dangerSoft },
  pillText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.text },
});
