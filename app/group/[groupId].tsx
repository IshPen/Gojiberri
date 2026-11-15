import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { brand, colors, font, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { formatWindow } from "../../lib/format";
import { avatarFor } from "../../lib/avatar";
import { crewStanding, formatPts } from "../../lib/school";
import { useUserId } from "../../lib/session";
import { cleanTitle } from "../../lib/format";

type Plan = FunctionReturnType<typeof api.plans.getGroupPlans>[number];

type PlanStatus = "generating" | "voting" | "locked" | "done" | "cancelled";


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

  const liveArgs = groupId ? { groupId: gid } : "skip";
  const group = useQuery(api.groups.getGroup, liveArgs);
  const plans = useQuery(api.plans.getGroupPlans, liveArgs);
  const user = useQuery(api.users.getUser, userId ? { userId: userId as Id<"users"> } : "skip");
  const school = user?.homeArea ?? null;
  const allCrews = useQuery(api.points.groupLeaderboard, { limit: 1000 });

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
  const potPlan = upcoming.find((p) => p.status === "locked") ?? upcoming[0] ?? past[0];
  const planTitle = (p: Plan) => cleanTitle((p.winningIndex !== undefined ? p.options[p.winningIndex]?.title : undefined) ?? "Outing ideas");
  const crewRank = allCrews ? crewStanding(allCrews, (id) => id === group._id) : undefined;
  const standing =
    crewRank === undefined
      ? null
      : !crewRank
        ? `Check in on a group outing to put ${group.name} on the board.`
        : crewRank.ahead
          ? `#${crewRank.rank} at ${crewRank.school} · ${crewRank.ahead.name} is ${formatPts(Math.max(0, crewRank.ahead.avgPoints - crewRank.crew.avgPoints))} pts ahead`
          : crewRank.behind
            ? `#1 at ${crewRank.school} · ${formatPts(crewRank.crew.avgPoints - crewRank.behind.avgPoints)} pts ahead of ${crewRank.behind.name}`
            : `#1 at ${crewRank.school}. Hold the lead!`;
  const renderPlan = (p: Plan, i: number) => (
    <Card key={p._id} testID={`plan-card-${i}`} onPress={() => router.push(`/plan/${p._id}`)} style={styles.planCard}>
      <View style={styles.planInfo}>
        <Text testID={`plan-title-${i}`} style={styles.planTitle}>
          {p.status === "generating" ? "Cooking up 3 ideas…" : planTitle(p)}
        </Text>
        <Text style={styles.planWindow}>{formatWindow(p.window)}</Text>
        {p.status === "voting" && p.options.length > 0 ? (
          <Text testID={`plan-suggestions-${i}`} style={styles.planWindow} numberOfLines={1}>
            Vote: {p.options.map((o) => cleanTitle(o.title)).join(" · ")}
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
      <Title testID="group-title">{group.name}</Title>
      {standing ? (
        <Text testID="group-standing-text" style={styles.standingText}>
          {standing}
        </Text>
      ) : null}

      <View testID="member-row" style={styles.members}>
        {group.members.map((m, i) => (
          <View key={m._id} style={styles.member}>
            <View testID={`member-avatar-${i}`} style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarFor(m)}</Text>
            </View>
            <Text testID={`member-name-${i}`} style={styles.memberName}>
              {m.name}
            </Text>
          </View>
        ))}
      </View>

      <Text testID="invite-code-chip" style={styles.inviteLabel} selectable>
        Invite code{" "}
        <Text testID="group-invite-code" style={styles.inviteCode}>
          {group.inviteCode}
        </Text>
      </Text>

      <Card testID="plan-on-for-you" tone="accent" onPress={() => router.push("/(tabs)/recommended")} style={styles.planCard}>
        <View style={styles.planInfo}>
          <Text style={styles.planTitle}>Pick an outing on For You</Text>
          <Text style={styles.planWindow}>Tap a pick, choose a time and your crew votes right there.</Text>
        </View>
        <Text style={styles.planTitle}>›</Text>
      </Card>

      <SectionHeader title="Your crew's plans" testID="upcoming-header" />
      {plans === undefined ? (
        <LoadingState label="Loading plans…" testID="plans-loading" />
      ) : upcoming.length === 0 ? (
        <EmptyState testID="plans-empty" emoji="🍓" title="No plans yet" body={`Pick an outing on For You and your crew votes. Check in together to earn ${brand.points}.`} />
      ) : (
        upcoming.map(renderPlan)
      )}

      {past.length > 0 ? (
        <>
          <SectionHeader title="Past plans" testID="past-header" />
          {past.map((p, i) => renderPlan(p, upcoming.length + i))}
        </>
      ) : null}

      {potPlan ? (
        <Card testID="pot-link" tone="muted" onPress={() => router.push(`/pot/${potPlan._id}`)} style={styles.planCard}>
          <View style={styles.planInfo}>
            <Text style={styles.planTitle}>🧺 Crew basket</Text>
            <Text style={styles.planWindow}>Add berries together and pay with your crew card</Text>
          </View>
          <Text style={styles.windowCheck}>›</Text>
        </Card>
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
  inviteLabel: { fontSize: font.size.sm, color: colors.textMuted },
  inviteCode: { fontSize: font.size.md, fontWeight: font.weight.heavy, letterSpacing: 2, color: colors.accentDark },
  windowCheck: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accent },
  planCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 64 },
  planInfo: { flex: 1, gap: spacing.xs },
  planTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  planWindow: { fontSize: font.size.sm, color: colors.textMuted },
  standingText: { alignSelf: "flex-start", fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.accentDark, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, overflow: "hidden" },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.warningSoft },
  pillSuccess: { backgroundColor: colors.successSoft },
  pillDanger: { backgroundColor: colors.dangerSoft },
  pillText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.text },
});
