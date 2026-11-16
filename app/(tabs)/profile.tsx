import { useRouter } from "expo-router";
import type { GenericId as Id } from "convex/values";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { SchoolCrest } from "../../components/SchoolBadge";
import { brand, colors, emoji, font, radius, shadow, spacing, type } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { formatGojis, formatRewards } from "../../lib/format";
import { initialsFor } from "../../lib/avatar";
import { crewStanding, formatPts, schoolFor } from "../../lib/school";
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
  const awards = useQuery(api.points.myRecentAwards, userId ? { userId: userId as Id<"users">, limit: 5 } : "skip");
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
      router.replace("/intro");
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
              <Text style={styles.avatarText}>{initialsFor(user.name)}</Text>
            </View>
            <Title testID="profile-name">{user.name}</Title>
            <Text testID="profile-budget" style={styles.area}>Up to ${user.budgetMax} per outing</Text>
          </View>

          <Card testID="profile-school-card" style={styles.schoolCard}>
            <SchoolCrest school={user.homeArea} size={52} testID="profile-school-crest" />
            <View style={styles.schoolBody}>
              <Text testID="profile-school-name" style={styles.schoolName}>
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
              <Text style={styles.statLabel}>Your {brand.points}</Text>
            </Card>
            <Card testID="profile-rewards-ready" style={styles.stat}>
              <Text style={styles.statEmoji}>{brand.rewardEmoji}</Text>
              <Text style={styles.statValue}>{user.diamonds}</Text>
              <Text style={styles.statLabel}>Rewards ready</Text>
            </Card>
          </View>

          <Card testID="reward-progress">
            <Text style={styles.progressTitle}>
              {brand.pointsEmoji} {toNext} / {brand.pointsPerReward} {brand.rewardEmoji}
            </Text>
            <View style={styles.track}>
              <View testID="reward-progress-fill" style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            {user.diamonds > 0 ? <Text style={styles.progressHint}>🎁 {formatRewards(user.diamonds)} ready</Text> : null}
          </Card>

          <Card testID="goji-explainer" tone="muted" style={styles.earn}>
            <View style={styles.earnGrid}>
              {EARN_WAYS.map((way) => (
                <View key={way.title} style={styles.earnRow}>
                  <Text style={styles.earnEmoji}>{way.emoji}</Text>
                  <Text style={styles.earnTitle}>+{way.points}</Text>
                  <Text style={styles.earnLabel}>{way.title}</Text>
                </View>
              ))}
            </View>
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
            <Button testID={`reward-show-qr-${i}`} label="Show QR" variant="secondary" onPress={() => router.push(`/redeem/reward/${r._id}`)} style={{ marginTop: spacing.md }} />
          </Card>
        ))
      )}

      {awards && awards.length > 0 ? (
        <>
          <SectionHeader title={`Recent ${brand.points}`} testID="awards-header" />
          <Card testID="recent-awards" style={styles.awards}>
            {awards.map((a, i) => (
              <Text key={i} testID={`award-${a.reason}-${i}`} style={a.reason === "fullcrew_bonus" ? styles.awardHighlight : styles.awardText}>
                +{a.points} {a.label}
              </Text>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Your taste" testID="knows-header" />
      <Card testID="profile-knows" tone="muted" style={{ gap: spacing.sm }}>
        {knowsLoading ? (
          <View style={styles.knowsState}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.knowsText}>Thinking…</Text>
          </View>
        ) : knowsError ? (
          <ErrorState testID="profile-knows-error" message={knowsError} onRetry={loadKnows} />
        ) : knows && knows.length > 0 ? (
          <View style={styles.knowsChips}>
            {knows.slice(0, 6).map((k, i) => (
              <Text key={i} testID={`profile-knows-item-${i}`} style={styles.knowsChip} numberOfLines={1}>
                {k.replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, "").replace(/\.$/, "")}
              </Text>
            ))}
          </View>
        ) : (
          <Text testID="profile-knows-empty" style={styles.knowsText}>
            Nothing yet
          </Text>
        )}
        <Button testID="profile-knows-refresh" label="↻" accessibilityLabel="Refresh your taste" variant="ghost" onPress={loadKnows} loading={knowsLoading} />
      </Card>

      <Button testID="profile-how-it-works" label="How it works" variant="ghost" onPress={() => router.push({ pathname: "/intro", params: { replay: "1" } })} />
      <Button testID="sign-out" label="Sign out · switch account" variant="danger" onPress={signOut} loading={signingOut} />
    </Screen>
  );
}

const EARN_WAYS = [
  { emoji: "📸", title: "Check in", points: 50 },
  { emoji: "🧭", title: "New", points: 25 },
  { emoji: "🔁", title: "Regular", points: 15 },
  { emoji: "👯", title: "Full crew", points: 20 },
];

const styles = StyleSheet.create({
  earn: { gap: spacing.sm },
  earnGrid: { flexDirection: "row", justifyContent: "space-between" },
  earnRow: { alignItems: "center", gap: 2, flex: 1 },
  earnLabel: { fontSize: font.size.xs, color: colors.textMuted, fontWeight: font.weight.semibold },
  knowsChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  knowsChip: { maxWidth: "100%", fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.accentDark, backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, overflow: "hidden" },
  earnEmoji: { fontSize: font.size.lg },
  earnTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  hero: { alignItems: "center", gap: spacing.sm },
  schoolCard: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  schoolBody: { flex: 1, gap: spacing.xs },
  schoolName: { ...type.heading, fontSize: font.size.xl },
  schoolMeta: { fontSize: font.size.sm, color: colors.textMuted },
  crews: { gap: spacing.sm },
  crewChip: { gap: 2 },
  crewName: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.card, ...shadow.lift },
  avatarText: { fontSize: 36, fontWeight: font.weight.heavy, color: colors.accentDark },
  area: { fontSize: font.size.md, color: colors.textMuted },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.lg },
  statEmoji: { fontSize: emoji.md },
  statValue: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.text },
  statLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.textMuted, textAlign: "center" },
  progressTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  track: { height: 14, borderRadius: radius.pill, backgroundColor: colors.cardMuted, marginVertical: spacing.md, overflow: "hidden" },
  fill: { height: 14, borderRadius: radius.pill, backgroundColor: colors.gold },
  progressHint: { fontSize: font.size.sm, color: colors.textMuted },
  awards: { gap: spacing.xs },
  awardText: { fontSize: font.size.md, color: colors.text },
  awardHighlight: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.success },
  rewardBiz: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  rewardCode: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark, marginTop: spacing.xs, letterSpacing: 1 },
  knowsState: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  knowsText: { fontSize: font.size.md, color: colors.text, lineHeight: 22 },
});
