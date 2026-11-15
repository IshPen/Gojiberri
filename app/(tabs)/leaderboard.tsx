import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { useRouter, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Subtitle, Title } from "../../components/ui";
import { api } from "../../convex/_generated/api";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { useMockQuery } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;

type CrewRow = { groupId: Id<"groups">; name: string; school: string; avgPoints: number; memberCount: number };
type SchoolRow = { school: string; avgPoints: number; userCount: number };
type MyRanks = {
  crewRank: number;
  crewName: string;
  crewAvg: number;
  leaderName: string;
  leaderAvg: number;
  schoolRank: number;
  school: string;
};

// TODO(convex): swap to api.points.groupLeaderboard / schoolLeaderboard / myRanks once I-8 lands
const groupLeaderboardRef = makeFunctionReference<"query", { school?: string; limit: number }, CrewRow[]>(
  "points:groupLeaderboard",
);
const schoolLeaderboardRef = makeFunctionReference<"query", { limit: number }, SchoolRow[]>("points:schoolLeaderboard");
const myRanksRef = makeFunctionReference<"query", { userId: Id<"users"> }, MyRanks | null>("points:myRanks");

const MOCK_MY_GROUP = "mock_hack_crew" as Id<"groups">;
const MOCK_MY_SCHOOL = "Berkeley";
const crew = (id: string, name: string, school: string, avgPoints: number, memberCount: number): CrewRow => ({
  groupId: id as Id<"groups">,
  name,
  school,
  avgPoints,
  memberCount,
});
const MOCK_CREWS: CrewRow[] = [
  crew("mock_unit3", "Unit 3 Floor 2", "Berkeley", 340, 6),
  crew(MOCK_MY_GROUP, "Hack Crew", "Berkeley", 320, 3),
  crew("mock_usf_climb", "USF Climbing Club", "USF", 310, 5),
  crew("mock_boba", "Stanford Boba Society", "Stanford", 295, 6),
  crew("mock_61b", "CS 61B Survivors", "Berkeley", 275, 5),
  crew("mock_frosoco", "FroSoCo 2nd Floor", "Stanford", 230, 5),
  crew("mock_lone_mtn", "Lone Mountain Lofts", "USF", 205, 4),
  crew("mock_ck", "Clark Kerr Climbers", "Berkeley", 190, 4),
];
const MOCK_SCHOOLS: SchoolRow[] = [
  { school: "Berkeley", avgPoints: 298, userCount: 18 },
  { school: "Stanford", avgPoints: 262, userCount: 11 },
  { school: "USF", avgPoints: 251, userCount: 9 },
  { school: "SF State", avgPoints: 140, userCount: 4 },
];
const MOCK_MY_RANKS: MyRanks = {
  crewRank: 2,
  crewName: "Hack Crew",
  crewAvg: 320,
  leaderName: "Unit 3 Floor 2",
  leaderAvg: 340,
  schoolRank: 1,
  school: "Berkeley",
};

const MEDALS = ["🥇", "🥈", "🥉"];
const LIMIT = 20;

type Segment = "crews" | "schools" | "me";
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "crews", label: "Crews" },
  { key: "schools", label: "Schools" },
  { key: "me", label: "Me" },
];

const crewKey = (row: CrewRow) => row.groupId;
const schoolKey = (row: SchoolRow) => row.school;

function useRankedRows<T>(rows: T[] | undefined | null, keyOf: (row: T) => string) {
  const [shown, setShown] = useState(rows);
  const previous = useRef(new Map<string, number>());
  const [deltas, setDeltas] = useState(new Map<string, number>());

  useEffect(() => {
    if (!rows) {
      setShown(rows);
      return;
    }
    const next = new Map(rows.map((row, i) => [keyOf(row), i]));
    const moved = new Map<string, number>();
    next.forEach((rank, key) => {
      const before = previous.current.get(key);
      if (before !== undefined && before !== rank) moved.set(key, before - rank);
    });
    if (moved.size > 0) LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    previous.current = next;
    setDeltas(moved);
    setShown(rows);
  }, [rows, keyOf]);

  return { rows: shown, deltas };
}

function RankBadge({ index, delta, testID }: { index: number; delta?: number; testID: string }) {
  return (
    <View style={styles.rankCol}>
      <Text testID={testID} style={index < 3 ? styles.medal : styles.rank}>
        {index < 3 ? MEDALS[index] : index + 1}
      </Text>
      {delta ? (
        <Text testID={testID + "-delta"} style={[styles.delta, { color: delta > 0 ? colors.success : colors.danger }]}>
          {delta > 0 ? "▲" : "▼"}
          {Math.abs(delta)}
        </Text>
      ) : null}
    </View>
  );
}

function CrewsSection({ mySchool, myGroupIds }: { mySchool: string | null; myGroupIds: Set<string> }) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const school = scope === "mine" && mySchool ? mySchool : undefined;
  const live = useQuery(groupLeaderboardRef, USE_MOCK ? "skip" : { school, limit: LIMIT });
  const mockRows = useMemo(() => MOCK_CREWS.filter((c) => !school || c.school === school).slice(0, LIMIT), [school]);
  const mock = useMockQuery(mockRows, USE_MOCK);
  const { rows, deltas } = useRankedRows(USE_MOCK ? mock : live, crewKey);

  return (
    <View style={styles.section} testID="crews-section">
      <View style={styles.toggle}>
        {(["mine", "all"] as const).map((key) => (
          <Pressable
            key={key}
            testID={"crews-scope-" + key}
            accessibilityRole="button"
            accessibilityState={{ selected: scope === key }}
            onPress={() => setScope(key)}
            style={[styles.toggleItem, scope === key && styles.toggleItemOn]}
          >
            <Text style={[styles.toggleText, scope === key && styles.toggleTextOn]}>
              {key === "mine" ? (mySchool ?? "My school") : "All schools"}
            </Text>
          </Pressable>
        ))}
      </View>

      {rows === undefined ? (
        <LoadingState testID="crews-loading" label="Loading crews…" />
      ) : rows === null ? (
        <ErrorState testID="crews-error" message="Couldn't load the crew leaderboard." />
      ) : rows.length === 0 ? (
        <EmptyState
          testID="crews-empty"
          emoji="🏁"
          title="No crews on the board yet"
          body="Check in somewhere with your crew this week to put your floor on the map."
        />
      ) : (
        rows.map((c, i) => {
          const mine = myGroupIds.has(c.groupId);
          return (
            <Card key={c.groupId} testID={"crew-row-" + i} tone={mine ? "accent" : "default"} style={[styles.row, i < 3 && styles.podiumRow]}>
              <RankBadge index={i} delta={deltas.get(c.groupId)} testID={"crew-rank-" + i} />
              <View style={styles.rowBody}>
                <Text testID={"crew-name-" + i} numberOfLines={1} style={styles.rowTitle}>
                  {c.name}
                  {mine ? " (you)" : ""}
                </Text>
                <Text style={styles.rowMeta}>
                  {c.school} · {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                </Text>
              </View>
              <View style={styles.scoreCol}>
                <Text testID={"crew-points-" + i} style={styles.score}>
                  {Math.round(c.avgPoints).toLocaleString()}
                </Text>
                <Text style={styles.scoreUnit}>avg {brand.pointsEmoji}</Text>
              </View>
              {mine ? <View testID="crew-row-mine" /> : null}
            </Card>
          );
        })
      )}
    </View>
  );
}

function SchoolsSection({ mySchool }: { mySchool: string | null }) {
  const live = useQuery(schoolLeaderboardRef, USE_MOCK ? "skip" : { limit: LIMIT });
  const mock = useMockQuery(MOCK_SCHOOLS, USE_MOCK);
  const { rows, deltas } = useRankedRows(USE_MOCK ? mock : live, schoolKey);

  if (rows === undefined) return <LoadingState testID="schools-loading" label="Loading schools…" />;
  if (rows === null) return <ErrorState testID="schools-error" message="Couldn't load the school leaderboard." />;
  if (rows.length === 0) {
    return (
      <EmptyState testID="schools-empty" emoji="🏫" title="No schools yet" body="Pick your school in your profile to rep it here." />
    );
  }

  const [top, second] = rows;
  return (
    <View style={styles.section} testID="schools-section">
      {second ? (
        <Card testID="schools-rivalry" tone="muted" style={styles.rivalry}>
          <Text style={styles.rivalryName} numberOfLines={1}>
            {top.school}
          </Text>
          <Text style={styles.rivalryVs}>VS</Text>
          <Text style={styles.rivalryName} numberOfLines={1}>
            {second.school}
          </Text>
          <Text testID="schools-rivalry-gap" style={styles.rivalryGap}>
            {top.school} leads by {Math.round(top.avgPoints - second.avgPoints)} avg {brand.points}
          </Text>
        </Card>
      ) : null}
      {rows.map((s, i) => {
        const mine = s.school === mySchool;
        return (
          <Card key={s.school} testID={"school-row-" + i} tone={mine ? "accent" : "default"} style={[styles.row, styles.schoolRow, i < 3 && styles.podiumRow]}>
            <RankBadge index={i} delta={deltas.get(s.school)} testID={"school-rank-" + i} />
            <View style={styles.rowBody}>
              <Text testID={"school-name-" + i} numberOfLines={1} style={styles.schoolName}>
                {s.school}
                {mine ? " (you)" : ""}
              </Text>
              <Text style={styles.rowMeta}>
                {s.userCount} {s.userCount === 1 ? "student" : "students"}
              </Text>
            </View>
            <View style={styles.scoreCol}>
              <Text testID={"school-points-" + i} style={styles.score}>
                {Math.round(s.avgPoints).toLocaleString()}
              </Text>
              <Text style={styles.scoreUnit}>avg {brand.pointsEmoji}</Text>
            </View>
            {mine ? <View testID="school-row-mine" /> : null}
          </Card>
        );
      })}
    </View>
  );
}

function MeSection({ userId }: { userId: string | null }) {
  const router = useRouter();
  const live = useQuery(myRanksRef, USE_MOCK || !userId ? "skip" : { userId: userId as Id<"users"> });
  const mock = useMockQuery(MOCK_MY_RANKS, USE_MOCK);
  const ranks = USE_MOCK ? mock : userId ? live : null;
  const climb = (
    <View style={styles.climb}>
      <Button testID="me-check-in" label="Check in to climb" icon="📸" onPress={() => router.push("/camera")} />
      <Text testID="me-check-in-hint" style={styles.meSub}>
        Snap a photo at your crew's next outing to earn {brand.points}.
      </Text>
    </View>
  );

  if (!USE_MOCK && !userId) return <ErrorState testID="me-error" message="Sign in to see your ranks." />;
  if (ranks === undefined) return <LoadingState testID="me-loading" label="Finding your rank…" />;
  if (ranks === null) {
    return (
      <View style={styles.section}>
        <EmptyState testID="me-empty" emoji="🧭" title="No crew yet" body="Join or start a crew, then check in on a group outing to get on the board." />
        {climb}
      </View>
    );
  }

  const gap = Math.max(0, Math.round(ranks.leaderAvg - ranks.crewAvg));
  return (
    <View style={styles.section} testID="me-section">
      <Card testID="me-crew-card" tone="accent" style={styles.meCard}>
        <Text style={styles.meBig}>{ranks.crewRank <= 3 ? MEDALS[ranks.crewRank - 1] : "🏁"}</Text>
        <Text testID="me-crew-rank" style={styles.meHeadline}>
          {ranks.crewRank === 1
            ? "Your crew is #1 at " + ranks.school + ". Hold the lead!"
            : "Your crew is #" + ranks.crewRank + " at " + ranks.school + ", " + gap + " pts behind " + ranks.leaderName}
        </Text>
        <Text testID="me-crew-name" style={styles.meSub}>
          {ranks.crewName} · {Math.round(ranks.crewAvg)} avg {brand.points} this week
        </Text>
      </Card>
      <Card testID="me-school-card" style={styles.meCard}>
        <Text testID="me-school-rank" style={styles.meSchool}>
          {ranks.school} is #{ranks.schoolRank} among schools
        </Text>
        <Text style={styles.meSub}>Every group outing check-in raises your school's average too.</Text>
      </Card>
      {climb}
    </View>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="leaderboard-screen">
      <Title testID="leaderboard-title">Leaderboard</Title>
      <ErrorState testID="leaderboard-error" message="Couldn't load the leaderboard." onRetry={retry} />
    </Screen>
  );
}

export default function LeaderboardScreen() {
  const { userId } = useUserId();
  const [segment, setSegment] = useState<Segment>("crews");
  const liveUser = useQuery(api.users.getUser, USE_MOCK || !userId ? "skip" : { userId: userId as Id<"users"> });
  const liveGroups = useQuery(api.groups.getMyGroups, USE_MOCK || !userId ? "skip" : { userId: userId as Id<"users"> });
  const mySchool = USE_MOCK ? MOCK_MY_SCHOOL : (liveUser?.homeArea ?? null);
  const myGroupIds = new Set<string>(USE_MOCK ? [MOCK_MY_GROUP] : (liveGroups ?? []).map((g) => g._id));

  return (
    <Screen testID="leaderboard-screen">
      <Title testID="leaderboard-title">Leaderboard</Title>
      <Subtitle testID="leaderboard-subtitle">Your floor vs. theirs. Weekly average {brand.points} per member.</Subtitle>

      <View style={styles.segments} accessibilityRole="tablist">
        {SEGMENTS.map((s) => (
          <Pressable
            key={s.key}
            testID={"leaderboard-tab-" + s.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: segment === s.key }}
            onPress={() => setSegment(s.key)}
            style={[styles.segment, segment === s.key && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, segment === s.key && styles.segmentTextOn]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {segment === "crews" ? <CrewsSection mySchool={mySchool} myGroupIds={myGroupIds} /> : null}
      {segment === "schools" ? <SchoolsSection mySchool={mySchool} /> : null}
      {segment === "me" ? <MeSection userId={userId} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: "row", backgroundColor: colors.cardMuted, borderRadius: radius.pill, padding: spacing.xs },
  segment: { flex: 1, minHeight: minTapTarget, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  segmentOn: { backgroundColor: colors.card },
  segmentText: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.textMuted },
  segmentTextOn: { color: colors.accentDark },
  section: { gap: spacing.md },
  toggle: { flexDirection: "row", gap: spacing.sm },
  toggleItem: {
    minHeight: minTapTarget,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  toggleItemOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  toggleText: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.textMuted },
  toggleTextOn: { color: colors.accentDark },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: minTapTarget + 20,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  podiumRow: { borderWidth: 2 },
  schoolRow: { minHeight: minTapTarget + 36 },
  rankCol: { width: 36, alignItems: "center" },
  medal: { fontSize: 28 },
  rank: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.textMuted },
  delta: { fontSize: font.size.xs, fontWeight: font.weight.heavy },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  rowMeta: { fontSize: font.size.sm, color: colors.textMuted },
  schoolName: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text },
  scoreCol: { alignItems: "flex-end" },
  score: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark },
  scoreUnit: { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.textMuted },
  rivalry: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg },
  rivalryName: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.text },
  rivalryVs: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.accent, letterSpacing: 2 },
  rivalryGap: { marginTop: spacing.xs, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted },
  climb: { gap: spacing.sm },
  meCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  meBig: { fontSize: 48 },
  meHeadline: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark, textAlign: "center" },
  meSchool: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.text, textAlign: "center" },
  meSub: { fontSize: font.size.sm, color: colors.textMuted, textAlign: "center" },
});
