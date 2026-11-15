import type { FunctionReturnType } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { useRouter, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { SchoolHeader } from "../../components/SchoolBadge";
import { api } from "../../convex/_generated/api";
import { brand, colors, emoji, font, minTapTarget, radius, shadow, spacing, type } from "../../constants/theme";
import { crewStanding, formatPts } from "../../lib/school";
import { useUserId } from "../../lib/session";
import { cleanTitle } from "../../lib/format";

type CrewRow = { groupId: Id<"groups">; name: string; school: string; avgPoints: number; memberCount: number };
type SchoolRow = { school: string; avgPoints: number; userCount: number };
type LockedPlan = FunctionReturnType<typeof api.plans.getMyUpcomingPlans>[number];

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = [colors.gold, colors.silver, colors.bronze];
const LIMIT = 20;

type Segment = "crews" | "schools" | "me";
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "crews", label: "My school" },
  { key: "me", label: "My crew" },
  { key: "schools", label: "All schools" },
];

const crewKey = (row: CrewRow) => row.groupId;
const schoolKey = (row: SchoolRow) => row.school;

function useRankedRows<T>(rows: T[] | undefined | null, keyOf: (row: T) => string, scope = "") {
  const [shown, setShown] = useState(rows);
  const previous = useRef(new Map<string, number>());
  const previousScope = useRef(scope);
  const [deltas, setDeltas] = useState(new Map<string, number>());

  useEffect(() => {
    if (!rows) {
      setShown(rows);
      return;
    }
    if (previousScope.current !== scope) {
      previousScope.current = scope;
      previous.current = new Map();
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
  }, [rows, keyOf, scope]);

  return { rows: shown, deltas };
}

function RankBadge({ index, delta, testID }: { index: number; delta?: number; testID: string }) {
  return (
    <View style={styles.rankCol}>
      {index < 3 ? (
        <View style={[styles.medalDisc, { backgroundColor: MEDAL_COLORS[index] + "33", borderColor: MEDAL_COLORS[index] }]}>
          <Text testID={testID} style={styles.medal}>
            {MEDALS[index]}
          </Text>
        </View>
      ) : (
        <Text testID={testID} style={styles.rank}>
          {index + 1}
        </Text>
      )}
      {delta ? (
        <Text testID={testID + "-delta"} style={[styles.delta, { color: delta > 0 ? colors.success : colors.danger }]}>
          {delta > 0 ? "▲" : "▼"}
          {Math.abs(delta)}
        </Text>
      ) : null}
    </View>
  );
}

function RivalryCard({ rows, myGroupIds, school }: { rows: CrewRow[]; myGroupIds: Set<string>; school: string }) {
  const allCrews = useQuery(api.points.groupLeaderboard, { limit: 1000 });
  const standing = allCrews ? crewStanding(allCrews.filter((c) => c.school === school), (id) => myGroupIds.has(id)) : null;
  if (!standing) {
    const top = rows[0];
    return (
      <Card testID="crews-rivalry" style={styles.rivalry}>
        <Text style={styles.rivalryVs}>TOP OF {school.toUpperCase()}</Text>
        <Text style={styles.rivalryName} numberOfLines={1}>
          {top.name}
        </Text>
        <Text testID="crews-rivalry-gap" style={styles.rivalryGap}>
          Start a crew with your friends and check in on an outing to challenge them.
        </Text>
      </Card>
    );
  }
  const { crew: mine, ahead, behind, rank } = standing;
  const rival = ahead ?? behind;
  if (!rival) {
    return (
      <Card testID="crews-rivalry" style={styles.rivalry}>
        <Text style={styles.rivalryName}>{mine.name}</Text>
        <Text testID="crews-rivalry-gap" style={styles.rivalryGap}>
          The only crew on the {school} board so far. Invite another friend group to compete.
        </Text>
      </Card>
    );
  }
  const gap = formatPts(Math.abs(rival.avgPoints - mine.avgPoints));
  return (
    <Card testID="crews-rivalry" style={styles.rivalry}>
      <Text style={styles.rivalryName} numberOfLines={1}>
        {mine.name}
      </Text>
      <Text style={styles.rivalryVs}>VS</Text>
      <Text style={styles.rivalryName} numberOfLines={1}>
        {rival.name}
      </Text>
      <Text testID="crews-rivalry-gap" style={styles.rivalryGap}>
        {rank > 1 ? `#${rank} at ${school}: ${rival.name} is ${gap} pts ahead. One group outing could close it.` : `You're #1 at ${school}, ${gap} pts ahead of ${rival.name}. Hold the lead!`}
      </Text>
    </Card>
  );
}

function CrewsSection({ school, myGroupIds, testID = "crews-section" }: { school?: string; myGroupIds: Set<string>; testID?: string }) {
  const live = useQuery(api.points.groupLeaderboard, { school, limit: LIMIT });
  const { rows, deltas } = useRankedRows(live, crewKey, school ?? "all");

  return (
    <View style={styles.section} testID={testID}>
      {school && rows && rows.length > 0 ? <RivalryCard rows={rows} myGroupIds={myGroupIds} school={school} /> : null}
      {rows === undefined ? (
        <LoadingState testID="crews-loading" label="Loading crews…" />
      ) : rows === null ? (
        <ErrorState testID="crews-error" message="Couldn't load the crew leaderboard." />
      ) : rows.length === 0 ? (
        <EmptyState
          testID="crews-empty"
          emoji="🍓"
          title={school ? `No crews at ${school} yet` : "No crews on the board yet"}
          body="Start a crew with your friends and check in on a group outing to put it on the map."
        />
      ) : (
        rows.map((c, i) => {
          const mine = myGroupIds.has(c.groupId);
          return (
            <Card key={c.groupId} testID={"crew-row-" + i} tone={mine ? "accent" : "default"} style={styles.row}>
              <RankBadge index={i} delta={deltas.get(c.groupId)} testID={"crew-rank-" + i} />
              <View style={styles.rowBody}>
                <Text testID={"crew-name-" + i} numberOfLines={1} style={styles.rowTitle}>
                  {c.name}
                  {mine ? " (you)" : ""}
                </Text>
                <Text style={styles.rowMeta}>
                  {school ? "" : c.school + " · "}
                  {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                </Text>
              </View>
              <View style={styles.scoreCol}>
                <Text testID={"crew-points-" + i} style={styles.score}>
                  {formatPts(c.avgPoints)}
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
  const live = useQuery(api.points.schoolLeaderboard, { limit: LIMIT });
  const { rows, deltas } = useRankedRows(live, schoolKey);

  if (rows === undefined) return <LoadingState testID="schools-loading" label="Loading schools…" />;
  if (rows === null) return <ErrorState testID="schools-error" message="Couldn't load the school leaderboard." />;
  if (rows.length === 0) {
    return (
      <EmptyState testID="schools-empty" emoji="🏫" title="No schools yet" body="Join your school and check in with your crew to rep it here." />
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
            {top.school} leads by {formatPts(top.avgPoints - second.avgPoints)} avg {brand.points}
          </Text>
        </Card>
      ) : null}
      {rows.map((s, i) => {
        const mine = s.school === mySchool;
        return (
          <Card key={s.school} testID={"school-row-" + i} tone={mine ? "accent" : "default"} style={[styles.row, styles.schoolRow]}>
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
                {formatPts(s.avgPoints)}
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

function MeSection({ userId, crewId, myGroupIds }: { userId: string | null; crewId: string | null; myGroupIds: Set<string> }) {
  const router = useRouter();
  const live = useQuery(api.points.myRanks, userId ? { userId: userId as Id<"users"> } : "skip");
  const ranks = userId ? live : null;
  const allCrews = useQuery(api.points.groupLeaderboard, { limit: 1000 });
  const standing = allCrews ? crewStanding(allCrews, (id) => myGroupIds.has(id)) : undefined;
  const livePlans = useQuery(api.plans.getMyUpcomingPlans, userId ? { userId: userId as Id<"users"> } : "skip");
  const plans: LockedPlan[] | undefined | null = userId ? livePlans : null;
  const lockedPlan = plans
    ?.filter((p) => p.status === "locked")
    .reduce<LockedPlan | null>((latest, p) => (!latest || p._creationTime > latest._creationTime ? p : latest), null);

  const climb = (
    <View style={styles.climb} testID="me-climb">
      <Button
        testID="me-check-in"
        label="Check in to climb"
        icon="📸"
        loading={plans === undefined}
        disabled={!lockedPlan}
        onPress={() => {
          if (!lockedPlan) return;
          router.push({ pathname: "/camera", params: { planId: lockedPlan._id, groupId: lockedPlan.groupId } });
        }}
      />
      {plans === undefined ? (
        <Text testID="me-check-in-loading" style={styles.meSub}>
          Finding your crew's latest outing…
        </Text>
      ) : lockedPlan ? (
        <Text testID="me-check-in-hint" style={styles.meSub}>
          Snap a photo at {(lockedPlan.winner ? cleanTitle(lockedPlan.winner.title) : undefined) ?? "your crew's outing"} with {lockedPlan.groupName} to earn {brand.points}.
        </Text>
      ) : (
        <>
          <Text testID="me-check-in-no-plan" style={styles.meSub}>
            Lock a plan with your crew to start climbing
          </Text>
          <Button
            testID="me-check-in-go-crew"
            label={crewId ? "Plan something with your crew" : "Start a crew"}
            variant="secondary"
            onPress={() => router.push(crewId ? `/group/${crewId}` : "/group/new")}
          />
        </>
      )}
    </View>
  );

  if (!userId) return <ErrorState testID="me-error" message="Sign in to see your ranks." />;
  if (ranks === undefined || standing === undefined) return <LoadingState testID="me-loading" label="Finding your rank…" />;
  if (ranks === null || standing === null) {
    return (
      <View style={styles.section}>
        <EmptyState testID="me-empty" emoji="🧺" title="No crew yet" body="Join or start a crew, then check in on a group outing to get on the board." />
        {climb}
      </View>
    );
  }

  const gap = formatPts(Math.max(0, standing.leader.avgPoints - standing.crew.avgPoints));
  return (
    <View style={styles.section} testID="me-section">
      <Card testID="me-crew-card" tone="accent" style={styles.meCard}>
        <Text style={styles.meBig}>{standing.rank <= 3 ? MEDALS[standing.rank - 1] : "🏁"}</Text>
        <Text testID="me-crew-rank" style={styles.meHeadline}>
          {standing.rank === 1
            ? "Your crew is #1 at " + standing.school + ". Hold the lead!"
            : "Your crew is #" + standing.rank + " at " + standing.school + ", " + gap + " pts behind " + standing.leader.name}
        </Text>
        <Text testID="me-crew-name" style={styles.meSub}>
          {standing.crew.name} · {formatPts(standing.crew.avgPoints)} avg {brand.points} this week
        </Text>
      </Card>
      <Card testID="me-school-card" style={styles.meCard}>
        <Text testID="me-school-rank" style={styles.meSchool}>
          {ranks.schoolRank ? `${ranks.school} is #${ranks.schoolRank} among schools` : `${ranks.school} isn't on the schools board yet`}
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
  const args = userId ? { userId: userId as Id<"users"> } : "skip";
  const liveUser = useQuery(api.users.getUser, args);
  const liveGroups = useQuery(api.groups.getMyGroups, args);
  const mySchool = liveUser?.homeArea ?? null;
  const myGroupIds = new Set<string>((liveGroups ?? []).map((g) => g._id));

  return (
    <Screen testID="leaderboard-screen">
      <SchoolHeader school={mySchool} testID="leaderboard-school-header" />
      <Title testID="leaderboard-title">{mySchool ? `${mySchool} leaderboard` : "Leaderboard"}</Title>
      <Subtitle testID="leaderboard-subtitle">Your crew vs. theirs. Weekly average {brand.points} per member, earned from group outing check-ins.</Subtitle>

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
        mySchool ? (
          <CrewsSection school={mySchool} myGroupIds={myGroupIds} />
        ) : liveUser === undefined && userId ? (
          <LoadingState testID="crews-loading" label="Finding your school…" />
        ) : (
          <EmptyState testID="crews-no-school" emoji="🏫" title="Join your school" body="Pick your school to see the crews you're up against." />
        )
      ) : null}
      {segment === "schools" ? (
        <>
          <SchoolsSection mySchool={mySchool} />
          <SectionHeader title="Top crews everywhere" testID="all-crews-header" />
          <CrewsSection myGroupIds={myGroupIds} testID="all-crews-section" />
        </>
      ) : null}
      {segment === "me" ? <MeSection userId={userId} crewId={liveGroups?.[0]?._id ?? null} myGroupIds={myGroupIds} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: "row", backgroundColor: colors.cardMuted, borderRadius: radius.pill, padding: spacing.xs },
  segment: { flex: 1, minHeight: minTapTarget, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  segmentOn: { backgroundColor: colors.card, ...shadow.sm },
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
  schoolRow: { minHeight: minTapTarget + 36 },
  rankCol: { width: 40, alignItems: "center" },
  medalDisc: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  medal: { fontSize: emoji.sm },
  rank: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.textMuted },
  delta: { fontSize: font.size.xs, fontWeight: font.weight.heavy },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: type.heading,
  rowMeta: { fontSize: font.size.sm, color: colors.textMuted },
  schoolName: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text },
  scoreCol: { alignItems: "flex-end" },
  score: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark },
  scoreUnit: { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.textMuted },
  rivalry: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  rivalryName: { ...type.title, textAlign: "center" },
  rivalryVs: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.accent, letterSpacing: 2 },
  rivalryGap: { marginTop: spacing.xs, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted },
  climb: { gap: spacing.sm },
  meCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  meBig: { fontSize: emoji.lg },
  meHeadline: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark, textAlign: "center" },
  meSchool: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.text, textAlign: "center" },
  meSub: { fontSize: font.size.sm, color: colors.textMuted, textAlign: "center" },
});
