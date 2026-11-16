import type { FunctionReturnType } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { useRouter, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import BerryBurst from "../../components/BerryBurst";
import LeaderboardPinned from "../../components/LeaderboardPinned";
import LeaderboardRow, { LeaderboardAvatar } from "../../components/LeaderboardRow";
import { rankShifts, useWeek, weekTrend } from "../../components/LeaderboardWeek";
import { SchoolCrest } from "../../components/SchoolBadge";
import { Button, EmptyState, ErrorState, LoadingState, Screen, Title } from "../../components/ui";
import { api } from "../../convex/_generated/api";
import { colors, font, minTapTarget, radius, shadow, spacing } from "../../constants/theme";
import { initialsFor } from "../../lib/avatar";
import { crewStanding, formatPts } from "../../lib/school";
import { useUserId } from "../../lib/session";

type CrewRow = FunctionReturnType<typeof api.points.groupLeaderboard>[number];
type SchoolRow = FunctionReturnType<typeof api.points.schoolLeaderboard>[number];
type LockedPlan = FunctionReturnType<typeof api.plans.getMyUpcomingPlans>[number];
type Segment = "crews" | "schools";

const SHOWN = 20;
const ZONE = 3;
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "crews", label: "My school" },
  { key: "schools", label: "All schools" },
];

const crewKey = (row: CrewRow) => row.groupId;
const schoolKey = (row: SchoolRow) => row.school;

function useLiveShifts<T>(rows: T[] | undefined, keyOf: (row: T) => string) {
  const previous = useRef(new Map<string, number>());
  const [shifts, setShifts] = useState(new Map<string, number>());
  useEffect(() => {
    if (!rows) return;
    const next = new Map(rows.map((row, i) => [keyOf(row), i]));
    const moved = new Map<string, number>();
    next.forEach((rank, key) => {
      const before = previous.current.get(key);
      if (before !== undefined && before !== rank) moved.set(key, before - rank);
    });
    if (moved.size > 0) LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    previous.current = next;
    setShifts(moved);
  }, [rows, keyOf]);
  return shifts;
}

function gapText<T>(rows: T[], i: number, nameOf: (row: T) => string, pointsOf: (row: T) => number) {
  if (i < 0) return null;
  if (i === 0) {
    const next = rows[1];
    return next ? `👑 +${formatPts(pointsOf(rows[0]) - pointsOf(next))} ahead` : "👑";
  }
  const diff = pointsOf(rows[i - 1]) - pointsOf(rows[i]);
  return diff > 0 ? `+${formatPts(diff)} to pass ${nameOf(rows[i - 1])}` : `Tied with ${nameOf(rows[i - 1])}`;
}

function Board<T>({
  rows,
  prefix,
  keyOf,
  nameOf,
  pointsOf,
  avatarOf,
  isMine,
  dayIndex,
}: {
  rows: T[];
  prefix: "crew" | "school";
  keyOf: (row: T) => string;
  nameOf: (row: T) => string;
  pointsOf: (row: T) => number;
  avatarOf: (row: T, mine: boolean) => ReactNode;
  isMine: (row: T) => boolean;
  dayIndex: number;
}) {
  const live = useLiveShifts(rows, keyOf);
  const trendOf = (row: T) => weekTrend(keyOf(row), pointsOf(row), dayIndex);
  const weekly = rankShifts(rows, keyOf, trendOf, dayIndex);
  const trendMax = Math.max(1, ...rows.map(pointsOf));
  const render = (row: T, i: number) => {
    const mine = isMine(row);
    return (
      <LeaderboardRow
        key={keyOf(row)}
        index={i}
        prefix={prefix}
        name={nameOf(row)}
        avatar={avatarOf(row, mine)}
        points={pointsOf(row)}
        gap={gapText(rows, i, nameOf, pointsOf)}
        trend={trendOf(row)}
        trendMax={trendMax}
        shift={live.get(keyOf(row)) ?? weekly.get(keyOf(row))}
        mine={mine}
      />
    );
  };
  const shown = rows.slice(0, SHOWN);
  return (
    <View style={styles.board} testID={prefix === "crew" ? "crews-section" : "schools-section"}>
      <View style={styles.zone} testID={prefix + "-promotion-zone"}>
        <Text style={styles.zoneLabel}>Top {ZONE}</Text>
        {shown.slice(0, ZONE).map(render)}
      </View>
      {shown.slice(ZONE).map((row, i) => render(row, i + ZONE))}
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
  const router = useRouter();
  const { userId } = useUserId();
  const [segment, setSegment] = useState<Segment>("crews");
  const { dayIndex } = useWeek();
  const args = userId ? { userId: userId as Id<"users"> } : "skip";
  const user = useQuery(api.users.getUser, args);
  const groups = useQuery(api.groups.getMyGroups, args);
  const livePlans = useQuery(api.plans.getMyUpcomingPlans, args);
  const mySchool = user?.homeArea ?? null;
  const allCrews = useQuery(api.points.groupLeaderboard, { limit: 1000 });
  const crews = useMemo(() => (allCrews && mySchool ? allCrews.filter((c) => c.school === mySchool) : allCrews), [allCrews, mySchool]);
  const schools = useQuery(api.points.schoolLeaderboard, { limit: 1000 });
  const ranks = useQuery(api.points.myRanks, args);

  const myGroupIds = new Set<string>((groups ?? []).map((g) => g._id));
  const isMyCrew = (c: CrewRow) => myGroupIds.has(c.groupId);
  const isMySchool = (s: SchoolRow) => s.school === mySchool;
  const standing = allCrews ? crewStanding(allCrews, (id) => myGroupIds.has(id)) : null;
  const crewIndex = standing ? standing.rank - 1 : -1;
  const schoolIndex = schools ? schools.findIndex(isMySchool) : -1;
  const plans: LockedPlan[] | undefined = userId ? livePlans : [];
  const lockedPlan = plans
    ?.filter((p) => p.status === "locked")
    .reduce<LockedPlan | null>((latest, p) => (!latest || p._creationTime > latest._creationTime ? p : latest), null);
  const crewId = groups?.[0]?._id ?? null;

  const action =
    plans === undefined ? (
      <Button testID="me-check-in" label="Check in" icon="📸" loading onPress={() => {}} />
    ) : lockedPlan ? (
      <Button
        testID="me-check-in"
        label="Check in"
        icon="📸"
        onPress={() => router.push({ pathname: "/camera", params: { planId: lockedPlan._id, groupId: lockedPlan.groupId } })}
      />
    ) : (
      <Button
        testID="me-check-in-go-crew"
        label={crewId ? "Plan an outing" : "Start a crew"}
        icon={crewId ? "🗓️" : "➕"}
        onPress={() => router.push(crewId ? `/group/${crewId}` : "/group/new")}
      />
    );

  const crewName = (c: CrewRow) => c.name;
  const crewPoints = (c: CrewRow) => c.avgPoints;
  const schoolName = (s: SchoolRow) => s.school;
  const schoolPoints = (s: SchoolRow) => s.avgPoints;
  const myCrew = standing?.crew ?? null;
  const mySchoolRow = schools && schoolIndex >= 0 ? schools[schoolIndex] : null;
  const fallbackName = ranks?.crewName ?? groups?.[0]?.name ?? "Your crew";

  const footer =
    segment === "crews" ? (
      <LeaderboardPinned
        testID="leaderboard-pinned"
        rank={myCrew ? crewIndex + 1 : null}
        total={standing?.rivals.length ?? 0}
        avatar={<LeaderboardAvatar glyph={initialsFor(myCrew?.name ?? fallbackName)} mine size={36} />}
        name={myCrew?.name ?? fallbackName}
        points={myCrew?.avgPoints ?? null}
        gap={standing ? gapText(standing.rivals, crewIndex, crewName, crewPoints) : null}
        action={action}
      />
    ) : (
      <LeaderboardPinned
        testID="leaderboard-pinned"
        rank={mySchoolRow ? schoolIndex + 1 : null}
        total={schools?.length ?? 0}
        avatar={<SchoolCrest school={mySchool} size={32} />}
        name={mySchool ?? "Your school"}
        points={mySchoolRow?.avgPoints ?? null}
        gap={schools ? gapText(schools, schoolIndex, schoolName, schoolPoints) : null}
        action={action}
      />
    );

  return (
    <Screen testID="leaderboard-screen" footer={userId ? footer : undefined}>
      <View style={styles.header}>
        {segment === "crews" && mySchool ? <SchoolCrest school={mySchool} size={34} testID="leaderboard-school-header" /> : <Text style={styles.headerEmoji}>🌎</Text>}
        <Title testID="leaderboard-title" style={styles.title}>
          {segment === "crews" ? (mySchool ? `${mySchool} league` : "League") : "All schools"}
        </Title>
      </View>

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

      {segment === "crews" ? (
        !mySchool ? (
          user === undefined && userId ? (
            <LoadingState testID="crews-loading" label="Finding your school…" />
          ) : (
            <EmptyState testID="crews-no-school" emoji="🏫" title="Join your school" body="Pick your school to see the crews you're up against." />
          )
        ) : crews === undefined ? (
          <LoadingState testID="crews-loading" label="Loading crews…" />
        ) : crews === null ? (
          <ErrorState testID="crews-error" message="Couldn't load the crew leaderboard." />
        ) : crews.length === 0 ? (
          <EmptyState testID="crews-empty" emoji="🍓" title={`No crews at ${mySchool} yet`} body="Check in on a crew outing to get on the board." />
        ) : (
          <Board rows={crews} prefix="crew" keyOf={crewKey} nameOf={crewName} pointsOf={crewPoints} isMine={isMyCrew} dayIndex={dayIndex} avatarOf={(c, mine) => <LeaderboardAvatar glyph={initialsFor(c.name)} mine={mine} />} />
        )
      ) : schools === undefined ? (
        <LoadingState testID="schools-loading" label="Loading schools…" />
      ) : schools === null ? (
        <ErrorState testID="schools-error" message="Couldn't load the school leaderboard." />
      ) : schools.length === 0 ? (
        <EmptyState testID="schools-empty" emoji="🏫" title="No schools yet" body="Check in with your crew to rep your school here." />
      ) : (
        <Board rows={schools} prefix="school" keyOf={schoolKey} nameOf={schoolName} pointsOf={schoolPoints} isMine={isMySchool} dayIndex={dayIndex} avatarOf={(s) => <SchoolCrest school={s.school} size={36} />} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerEmoji: { fontSize: 30 },
  title: { flex: 1 },
  segments: { flexDirection: "row", backgroundColor: colors.cardMuted, borderRadius: radius.pill, padding: spacing.xs },
  segment: { flex: 1, minHeight: minTapTarget, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  segmentOn: { backgroundColor: colors.card, ...shadow.sm },
  segmentText: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.textMuted },
  segmentTextOn: { color: colors.accentDark },
  board: { gap: spacing.xs },
  zone: { gap: spacing.xs, padding: spacing.xs, paddingTop: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.cardMuted, marginBottom: spacing.sm },
  zoneLabel: { fontSize: font.size.xs, fontWeight: font.weight.heavy, letterSpacing: 1.2, color: colors.success, textTransform: "uppercase", paddingHorizontal: spacing.md },
});
