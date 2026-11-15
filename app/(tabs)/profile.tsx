import { useRouter } from "expo-router";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { brand, colors, font, radius, spacing } from "../../constants/theme";
import { formatGojis, formatRewards } from "../../lib/format";
import { mockDelay, useMockQuery } from "../../lib/mock";
import { clearUserId, useUserId } from "../../lib/session";

const USE_MOCK = true;

type User = { _id: Id<"users">; name: string; avatarUrl?: string; points: number; diamonds: number; streak: number; vibes: string[]; homeArea: string; budgetMax: number };
type Reward = { _id: Id<"rewards">; business: string; code: string };

// TODO(convex): swap to api.users.getUser once it lands
const getUserRef = makeFunctionReference<"query", { userId: Id<"users"> }, User | null>("users:getUser");
// TODO(convex): swap to api.sponsors.getMyRewards once it lands (rewards table by_user, joined with sponsor business)
const getMyRewardsRef = makeFunctionReference<"query", { userId: Id<"users"> }, Reward[]>("sponsors:getMyRewards");
// TODO(convex): swap to api.memory.getMyProfile once it lands
const getMyProfileRef = makeFunctionReference<"action", { userId: Id<"users"> }, string[]>("memory:getMyProfile");

const MOCK_USER: User = {
  _id: "mock_uma" as Id<"users">,
  name: "Uma",
  points: 1240,
  diamonds: 2,
  streak: 4,
  vibes: ["cozy", "foodie"],
  homeArea: "Mission",
  budgetMax: 30,
};
const MOCK_REWARDS: Reward[] = [
  { _id: "mock_r1" as Id<"rewards">, business: "Ritual Coffee Roasters", code: "GOJI-RITUAL10" },
  { _id: "mock_r2" as Id<"rewards">, business: "Humphry Slocombe", code: "GOJI-SCOOP5" },
];
const MOCK_KNOWS = [
  "You love cozy spots with good coffee.",
  "You usually keep outings under $30.",
  "You rated Escape SF 5 stars and called it thrilling.",
  "You like hanging out in the Mission.",
];

export default function ProfileScreen() {
  const router = useRouter();
  const { userId } = useUserId();
  const skip = USE_MOCK || !userId;
  const args = { userId: userId as Id<"users"> };

  const liveUser = useQuery(getUserRef, skip ? "skip" : args);
  const liveRewards = useQuery(getMyRewardsRef, skip ? "skip" : args);
  const mockUser = useMockQuery(MOCK_USER, USE_MOCK);
  const mockRewards = useMockQuery(MOCK_REWARDS, USE_MOCK, 800);
  const user = USE_MOCK ? mockUser : liveUser;
  const rewards = USE_MOCK ? mockRewards : liveRewards;

  const getProfileLive = useAction(getMyProfileRef);
  const getProfile = USE_MOCK ? (_args: { userId: Id<"users"> }) => mockDelay(MOCK_KNOWS, 1200) : getProfileLive;

  const [knows, setKnows] = useState<string[] | undefined>(undefined);
  const [knowsError, setKnowsError] = useState<string | null>(null);
  const [knowsLoading, setKnowsLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadKnows = useCallback(async () => {
    if (!USE_MOCK && !userId) return;
    setKnowsLoading(true);
    setKnowsError(null);
    try {
      setKnows(await getProfile({ userId: (userId ?? "mock_uma") as Id<"users"> }));
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
      router.replace("/onboarding/name");
    } finally {
      setSigningOut(false);
    }
  };

  const toNext = user ? user.points % brand.pointsPerReward : 0;
  const pct = Math.round((toNext / brand.pointsPerReward) * 100);

  return (
    <Screen testID="profile-screen">
      {user === undefined ? (
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
            <Text style={styles.area}>📍 {user.homeArea} · up to ${user.budgetMax} per outing</Text>
          </View>

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
            <Card testID="profile-streak" style={styles.stat}>
              <Text style={styles.statEmoji}>🔥</Text>
              <Text style={styles.statValue}>{user.streak}</Text>
              <Text style={styles.statLabel}>Streak</Text>
            </Card>
          </View>

          <Card testID="reward-progress">
            <Text style={styles.progressTitle}>
              {formatGojis(toNext)} / {brand.pointsPerReward} to your next free reward {brand.rewardEmoji}
            </Text>
            <View style={styles.track}>
              <View testID="reward-progress-fill" style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressHint}>{user.diamonds > 0 ? `You have ${formatRewards(user.diamonds)} ready. Redeem at any sponsor.` : `Every ${brand.pointsPerReward} ${brand.points} unlocks a free treat.`}</Text>
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
            <Button testID={`reward-show-qr-${i}`} label="Show QR" icon="📱" variant="secondary" onPress={() => router.push(`/redeem/reward/${r._id}`)} style={{ marginTop: spacing.md }} />
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
            Nothing yet. Swipe, rate and complete quests and {brand.name} will learn your taste.
          </Text>
        )}
        <Button testID="profile-knows-refresh" label="Refresh" variant="secondary" onPress={loadKnows} loading={knowsLoading} />
      </Card>

      <Button testID="sponsor-dashboard-link" label="Sponsor dashboard (demo)" variant="secondary" onPress={() => router.push("/sponsor-dashboard")} />
      <Button testID="sign-out" label="Sign out" variant="danger" onPress={signOut} loading={signingOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.sm },
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
