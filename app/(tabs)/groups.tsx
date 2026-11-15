import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { SchoolHeader } from "../../components/SchoolBadge";
import { brand, colors, font, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { crewStanding, formatPts, schoolFor, withAlpha } from "../../lib/school";
import { useUserId } from "../../lib/session";

export default function GroupsScreen() {
  const router = useRouter();
  const { userId, loading } = useUserId();
  const args = userId ? { userId: userId as Id<"users"> } : "skip";
  const user = useQuery(api.users.getUser, args);
  const groups = useQuery(api.groups.getMyGroups, args);
  const school = user?.homeArea ?? null;
  const allCrews = useQuery(api.points.groupLeaderboard, { limit: 1000 });
  const board = allCrews?.filter((c) => c.school === school);
  const accent = schoolFor(school).color;

  const myIds = new Set<string>((groups ?? []).map((g) => g._id));
  const myBest = (board ?? []).find((c) => myIds.has(c.groupId));
  const rivals = (board ?? []).filter((c) => !myIds.has(c.groupId));
  const rankOf = (groupId: string) => {
    const s = allCrews ? crewStanding(allCrews, (id) => id === groupId) : null;
    return s ? { rank: s.rank, school: s.school } : null;
  };

  const rivalLine = (avg: number) => {
    if (!myBest) return `${formatPts(avg)} avg ${brand.points} this week`;
    const gap = avg - myBest.avgPoints;
    if (gap > 0) return `${formatPts(gap)} pts ahead of ${myBest.name}`;
    if (gap < 0) return `${formatPts(-gap)} pts behind ${myBest.name}`;
    return `Tied with ${myBest.name}`;
  };

  if (!loading && !userId) {
    return (
      <Screen testID="groups-screen">
        <Title testID="groups-title">Your crews</Title>
        <ErrorState testID="groups-no-user" message="Join your school first to see its crews." onRetry={() => router.replace("/onboarding/school")} />
      </Screen>
    );
  }

  return (
    <Screen testID="groups-screen">
      <SchoolHeader school={school} testID="groups-school-header" />
      <Title testID="groups-title">{school ? `Your crews at ${school}` : "Your crews"}</Title>
      <Subtitle testID="groups-subtitle">Your friend group vs. the other crews on campus. Check in on group outings to climb.</Subtitle>
      <View style={styles.actions}>
        <Button
          testID="create-group-button"
          label={school ? `Start a crew at ${school}` : "Start a crew"}
          icon="➕"
          onPress={() => router.push("/group/new")}
        />
        <Button testID="join-group-button" label="Join a friend's crew" variant="secondary" onPress={() => router.push("/group/join")} />
      </View>

      {groups === undefined ? (
        <LoadingState label="Loading your crews…" testID="groups-loading" />
      ) : groups === null ? (
        <ErrorState testID="groups-error" message="We couldn't load your crews." />
      ) : groups.length === 0 ? (
        <EmptyState
          testID="groups-empty"
          emoji="👯"
          title={school ? `No crew at ${school} yet` : "No crew yet"}
          body="Start a crew with your friend group or join one with an invite code."
          actionLabel="Start a crew"
          actionTestID="groups-empty-action"
          onAction={() => router.push("/group/new")}
        />
      ) : (
        groups.map((group, i) => {
          const rank = rankOf(group._id);
          return (
            <Card key={group._id} testID={`group-card-${i}`} onPress={() => router.push(`/group/${group._id}`)} style={[styles.groupCard, { borderLeftColor: accent }]}>
              <View style={styles.cardTop}>
                <Text testID={`group-name-${i}`} style={styles.groupName} numberOfLines={1}>
                  {group.name}
                </Text>
                {rank ? (
                  <View testID={`group-rank-${i}`} style={[styles.rankPill, { backgroundColor: withAlpha(accent, 0.12) }]}>
                    <Text style={[styles.rankText, { color: accent }]}>#{rank.rank} at {rank.school}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.avatars}>
                {group.members.map((m, j) => (
                  <View key={m._id} testID={`group-${i}-avatar-${j}`} style={[styles.avatar, j > 0 && { marginLeft: -10 }]}>
                    <Text style={styles.avatarText}>{m.name.charAt(0).toUpperCase()}</Text>
                  </View>
                ))}
              </View>
              <Text testID={`group-members-${i}`} style={styles.members}>
                {group.members.length} {group.members.length === 1 ? "member" : "members"} · {group.members.map((m) => m.name).join(", ")}
              </Text>
            </Card>
          );
        })
      )}

      {school ? (
        <>
          <SectionHeader title={`Rival crews at ${school}`} testID="rivals-header" />
          {board === undefined ? (
            <LoadingState label="Scouting rival crews…" testID="rivals-loading" />
          ) : rivals.length === 0 ? (
            <EmptyState testID="rivals-empty" emoji="🏁" title="No rivals yet" body={`Yours could be the first crew at ${school}. Invite another friend group to compete.`} />
          ) : (
            rivals.slice(0, 5).map((c, i) => (
              <Card key={c.groupId} testID={`rival-row-${i}`} style={styles.rivalRow}>
                <Text testID={`rival-rank-${i}`} style={[styles.rivalRank, { color: accent }]}>
                  #{rankOf(c.groupId)?.rank}
                </Text>
                <View style={styles.rivalBody}>
                  <Text testID={`rival-name-${i}`} style={styles.rivalName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text testID={`rival-gap-${i}`} style={styles.members}>
                    {myBest ? `${c.name} is ` : ""}
                    {rivalLine(c.avgPoints)}
                  </Text>
                </View>
              </Card>
            ))
          )}
          {rivals.length > 0 ? (
            <Button testID="rivals-see-board" label={`See the ${school} board`} variant="ghost" onPress={() => router.push("/(tabs)/leaderboard")} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.md },
  groupCard: { gap: spacing.md, borderLeftWidth: 6 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupName: { flex: 1, fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text },
  rankPill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  rankText: { fontSize: font.size.xs, fontWeight: font.weight.heavy },
  avatars: { flexDirection: "row" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: font.weight.heavy, color: colors.accentDark },
  members: { fontSize: font.size.sm, color: colors.textMuted },
  rivalRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rivalRank: { width: 40, fontSize: font.size.lg, fontWeight: font.weight.heavy, textAlign: "center" },
  rivalBody: { flex: 1, gap: 2 },
  rivalName: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
});
