import { useRouter } from "expo-router";
import type { GenericId as Id } from "convex/values";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { SchoolCrest } from "../../components/SchoolBadge";
import { brand, colors, font, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { formatGojis, formatRewards } from "../../lib/format";
import { crewStanding, formatPts, schoolFor, withAlpha } from "../../lib/school";
import { clearUserId, useUserId } from "../../lib/session";

export default function ProfileScreen() {
  const router = useRouter();
  const { userId } = useUserId();
  const args = userId ? { userId: userId as Id<"users"> } : "skip";

  const user = useQuery(api.users.getUser, args);
  const rewards = useQuery(api.sponsors.getMyRewards, args);
  const groups = useQuery(api.groups.getMyGroups, args);
  const ranks = useQuery(api.points.myRanks, args);
  const allCrews = useQuery(api.points.groupLeaderboard, { limit: 1000 });
  const getProfile = useAction(api.memory.getMyProfile);

  const [knows, setKnows] = useState<string[] | undefined>(undefined);
  const [knowsError, setKnowsError] = useState<string | null>(null);
  const [knowsLoading, setKnowsLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadKnows = useCallback(async () => {
    if (!userId) return;
    setKnowsLoading(true);
    setKnowsError(null);
    try {
      setKnows(await getProfile({ userId: userId as Id<"users"> }));
    } catch (e) {
      setKnowsError(e instanceof Error ? e.message : "Couldn't load your profile.");
    } finally {
      setKnowsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    loadKnows();
  }, [loadKnows]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await clearUserId();
      router.replace("/onboarding/school");
    } finally {
      setSigningOut(false);
    }
  };

  const lifetime = user ? user.points + ((user as { gojisSpent?: number }).gojisSpent ?? 0) : 0;
  const toNext = lifetime % brand.pointsPerReward;
  const pct = Math.round((toNext / brand.pointsPerReward) * 100);
  const school = schoolFor(user?.homeArea);
  const myIds = new Set<string>((groups ?? []).map((g) => g._id));
  const standing = allCrews && groups ? crewStanding(allCrews, (id) => myIds.has(id)) : undefined;

  return (
    <Screen testID="profile-screen">
      {!userId ? (
        <ErrorState testID="profile-no-user" message="Join your school to set up your profile." onRetry={() => router.replace("/onboarding/school")} />
      ) : user === undefined ? (
        <LoadingState testID="profile-loading" />
      ) : user === null ? (
        <ErrorState testID="profile-error" message="We couldn't find your profile." />
      ) : (
        <>
          <View style={styles.hero}>
            <View testID="profile-avatar" style={styles.avatar}>
              <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
            </View>
            <Title testID="profile-name">{user.name}</Title>
            <Text testID="profile-budget" style={styles.area}>Up to ${user.budgetMax} per outing</Text>
          </View>

          <Card testID="profile-school-card" style={[styles.schoolCard, { backgroundColor: withAlpha(school.color, 0.08), borderColor: withAlpha(school.color, 0.35) }]}>
            <SchoolCrest school={user.homeArea} size={52} testID="profile-school-crest" />
            <View style={styles.schoolBody}>
              <Text testID="profile-school-name" style={[styles.schoolName, { color: school.color }]}>
                {school.name} space
              </Text>
              <Text testID="profile-school-rank" style={styles.schoolMeta}>
                {standing === undefined
                  ? "Finding your rank…"
                  : !standing
                    ? "Join or start a crew to get ranked."
                    : `${standing.crew.name} is #${standing.rank} at ${standing.school}${standing.rank > 1 ? `, ${formatPts(Math.max(0, standing.leader.avgPoints - standing.crew.avgPoints))} pts behind ${standing.leader.name}` : ". Hold the lead!"}`}
              </Text>
              {ranks?.schoolRank ? (
                <Text testID="profile-school-among" style={styles.schoolMeta}>
                  {school.name} is #{ranks.schoolRank} among schools
                </Text>
              ) : null}
            </View>
          </Card>

          <SectionHeader title="Your crews" testID="profile-crews-header" />
          {groups === undefined ? (
            <LoadingState testID="profile-crews-loading" label="Loading your crews…" />
          ) : groups.length === 0 ? (
            <EmptyState
              testID="profile-crews-empty"
              emoji="👯"
              title="No crew yet"
              body={`Start a crew with your friend group at ${school.name}.`}
              actionLabel="Start a crew"
              actionTestID="profile-crews-empty-action"
              onAction={() => router.push("/group/new")}
            />
          ) : (
            <View testID="profile-crews" style={styles.crews}>
              {groups.map((g, i) => (
                <Card key={g._id} testID={`profile-crew-${i}`} onPress={() => router.push(`/group/${g._id}`)} style={styles.crewChip}>
                  <Text style={styles.crewName} numberOfLines={1}>
                    👯 {g.name}
                  </Text>
                  <Text style={styles.schoolMeta}>
                    {g.members.length} {g.members.length === 1 ? "member" : "members"}
                  </Text>
                </Card>
              ))}
            </View>
          )}

          <View style={styles.stats}>
            <Card testID="profile-gojis" style={styles.stat}>
              <Text style={styles.statEmoji}>{brand.pointsEmoji}</Text>
              <Text style={styles.statValue}>{user.points.toLocaleString()}</Text>
              <Text style={styles.statLabel}>{brand.points}</Text>
            </Card>
            <Card testID="profile-rewards-ready" style={styles.stat}>
              <Text style={styles.statEmoji}>{brand.rewardEmoji}</Text>
              <Text style={styles.statValue}>{user.diamonds}</Text>
              <Text style={styles.statLabel}>Rewards ready</Text>
            </Card>
          </View>

          <Card testID="reward-progress">
            <Text style={styles.progressTitle}>
              {formatGojis(toNext)} / {brand.pointsPerReward} to your next free reward {brand.rewardEmoji}
            </Text>
            <View style={styles.track}>
              <View testID="reward-progress-fill" style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressHint}>{user.diamonds > 0 ? `You have ${formatRewards(user.diamonds)} ready. Redeem at any sponsor.` : `Earn ${brand.points} by checking in on group outings with your crew. Every ${brand.pointsPerReward} unlocks a free treat.`}</Text>
          </Card>
        </>
      )}

      <SectionHeader title="My promo codes" testID="rewards-header" />
      {rewards === undefined ? (
        <LoadingState testID="rewards-loading" />
      ) : rewards.length === 0 ? (
        <EmptyState testID="rewards-empty" emoji="🎁" title="No codes yet" body="Redeem a reward at a sponsor and your promo code shows up here." />
      ) : (
        rewards.map((r, i) => (
          <Card key={r._id} testID={`reward-${i}`}>
            <Text style={styles.rewardBiz}>{r.business}</Text>
            <Text style={styles.rewardCode}>{r.code}</Text>
          </Card>
        ))
      )}

      <SectionHeader title={`What ${brand.name} knows about you`} testID="knows-header" />
      <Card testID="profile-knows" tone="muted" style={{ gap: spacing.sm }}>
        {knowsLoading ? (
          <View style={styles.knowsState}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.knowsText}>Thinking…</Text>
          </View>
        ) : knowsError ? (
          <ErrorState testID="profile-knows-error" message={knowsError} onRetry={loadKnows} />
        ) : knows && knows.length > 0 ? (
          knows.map((k, i) => (
            <Text key={i} testID={`profile-knows-item-${i}`} style={styles.knowsText}>
              • {k}
            </Text>
          ))
        ) : (
          <Text testID="profile-knows-empty" style={styles.knowsText}>
            Nothing yet. Swipe and rate your crew's outings and {brand.name} will learn your taste.
          </Text>
        )}
        <Button testID="profile-knows-refresh" label="Refresh" variant="secondary" onPress={loadKnows} loading={knowsLoading} />
      </Card>

      <Button testID="sign-out" label="Sign out" variant="danger" onPress={signOut} loading={signingOut} />
      <Button testID="sponsor-dashboard-link" label="For businesses: sponsor dashboard" variant="ghost" onPress={() => router.push("/sponsor-dashboard")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.sm },
  schoolCard: { flexDirection: "row", alignItems: "center", gap: spacing.lg, borderWidth: 1 },
  schoolBody: { flex: 1, gap: spacing.xs },
  schoolName: { fontSize: font.size.xl, fontWeight: font.weight.heavy },
  schoolMeta: { fontSize: font.size.sm, color: colors.textMuted },
  crews: { gap: spacing.sm },
  crewChip: { gap: 2 },
  crewName: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.accent },
  avatarText: { fontSize: 44, fontWeight: font.weight.heavy, color: colors.accentDark },
  area: { fontSize: font.size.md, color: colors.textMuted },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.lg },
  statEmoji: { fontSize: 28 },
  statValue: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.text },
  statLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.textMuted, textAlign: "center" },
  progressTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  track: { height: 14, borderRadius: radius.pill, backgroundColor: colors.cardMuted, marginVertical: spacing.md, overflow: "hidden" },
  fill: { height: 14, borderRadius: radius.pill, backgroundColor: colors.gold },
  progressHint: { fontSize: font.size.sm, color: colors.textMuted },
  rewardBiz: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  rewardCode: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark, marginTop: spacing.xs, letterSpacing: 1 },
  knowsState: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  knowsText: { fontSize: font.size.md, color: colors.text, lineHeight: 22 },
});
