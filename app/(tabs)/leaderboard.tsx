import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { StyleSheet, Text, View } from "react-native";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Subtitle, Title } from "../../components/ui";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { formatGojis } from "../../lib/format";
import { useMockQuery } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;
const MOCK_ME = "mock_uma";

type Leader = { _id: Id<"users">; name: string; avatarUrl?: string; points: number };
// TODO(convex): swap to api.points.leaderboard once it lands
const leaderboardRef = makeFunctionReference<"query", { limit: number }, Leader[]>("points:leaderboard");

const mk = (id: string, name: string, points: number): Leader => ({ _id: id as Id<"users">, name, points });
const MOCK_LEADERS: Leader[] = [
  mk("mock_gauri", "Gauri", 2310),
  mk("mock_ishan", "Ishan", 1895),
  mk(MOCK_ME, "Uma", 1240),
  mk("u4", "Maya", 1105),
  mk("u5", "Diego", 980),
  mk("u6", "Priya", 955),
  mk("u7", "Sam", 870),
  mk("u8", "Chen", 820),
  mk("u9", "Noor", 760),
  mk("u10", "Jules", 705),
  mk("u11", "Aiden", 640),
  mk("u12", "Zoe", 610),
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardScreen() {
  const { userId } = useUserId();
  const live = useQuery(leaderboardRef, USE_MOCK ? "skip" : { limit: 20 });
  const mock = useMockQuery(MOCK_LEADERS, USE_MOCK);
  const leaders = USE_MOCK ? mock : live;
  const meId = USE_MOCK ? MOCK_ME : userId;

  const myIndex = leaders ? leaders.findIndex((l) => l._id === meId) : -1;
  const podium = leaders?.slice(0, 3) ?? [];
  const rest = leaders?.slice(3) ?? [];
  const podiumOrder = [1, 0, 2].filter((i) => podium[i]);

  return (
    <Screen testID="leaderboard-screen">
      <Title testID="leaderboard-title">Leaderboard</Title>
      <Subtitle>Top explorers by {brand.points} {brand.pointsEmoji}</Subtitle>

      {leaders === undefined ? (
        <LoadingState testID="leaderboard-loading" />
      ) : leaders === null ? (
        <ErrorState testID="leaderboard-error" message="Couldn't load the leaderboard." />
      ) : leaders.length === 0 ? (
        <EmptyState testID="leaderboard-empty" emoji="🏆" title="No explorers yet" body="Complete a quest to claim the top spot." />
      ) : (
        <>
          {myIndex >= 0 ? (
            <Card testID="my-rank" tone="accent" style={styles.myRank}>
              <Text style={styles.myRankText}>Your rank: #{myIndex + 1}</Text>
            </Card>
          ) : null}

          <View style={styles.podium}>
            {podiumOrder.map((i) => {
              const l = podium[i];
              const me = l._id === meId;
              return (
                <View
                  key={l._id}
                  testID={`leaderboard-row-${i}`}
                  style={[styles.podiumCol, i === 0 && styles.first, me && styles.podiumMe]}
                >
                  <Text style={styles.medal}>{MEDALS[i]}</Text>
                  <View style={[styles.avatar, i === 0 && styles.avatarFirst]}>
                    <Text style={styles.avatarText}>{l.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.podiumName}>
                    {l.name}
                  </Text>
                  <Text style={styles.podiumPoints}>{formatGojis(l.points)}</Text>
                  {me ? <View testID="leaderboard-me" /> : null}
                </View>
              );
            })}
          </View>

          {rest.map((l, j) => {
            const i = j + 3;
            const me = l._id === meId;
            return (
              <View key={l._id} testID={`leaderboard-row-${i}`} style={[styles.row, me && styles.rowMe]}>
                {me ? <View testID="leaderboard-me" /> : null}
                <Text style={styles.rank}>{i + 1}</Text>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{l.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.name}>{l.name}{me ? " (you)" : ""}</Text>
                <Text style={styles.points}>{brand.pointsEmoji} {l.points.toLocaleString()}</Text>
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  myRank: { alignItems: "center", paddingVertical: spacing.md },
  myRankText: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark },
  podium: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: spacing.sm, marginVertical: spacing.md },
  podiumCol: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  first: { paddingVertical: spacing.xl, backgroundColor: colors.warningSoft, borderColor: colors.gold },
  podiumMe: { borderColor: colors.accent, borderWidth: 2 },
  medal: { fontSize: 28 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  avatarFirst: { width: 56, height: 56, borderRadius: 28 },
  avatarText: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.accentDark },
  podiumName: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  podiumPoints: { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.textMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: minTapTarget + 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  rowMe: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 2 },
  rank: { width: 28, fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.textMuted, textAlign: "center" },
  name: { flex: 1, fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  points: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.accentDark },
});
