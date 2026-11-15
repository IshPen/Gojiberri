import type { GenericId as Id } from "convex/values";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter, type ErrorBoundaryProps } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import GojiChip, { GojiDetails, useGojiPreviews } from "../../components/GojiChip";
import PlanPanel from "../../components/PlanPanel";
import PointsPill from "../../components/PointsPill";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { colors, font, spacing, type } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { formatWindow } from "../../lib/format";
import { useUserId } from "../../lib/session";
import { cleanTitle } from "../../lib/format";

const MAX_PICKS = 3;

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen>
      <ErrorState testID="home-load-error" message="Couldn't load your picks." onRetry={retry} />
    </Screen>
  );
}

export default function RecommendedScreen() {
  const router = useRouter();
  const { userId, loading } = useUserId();
  const args = userId ? { userId: userId as Id<"users"> } : "skip";
  const user = useQuery(api.users.getUser, args);
  const groups = useQuery(api.groups.getMyGroups, args);
  const plans = useQuery(api.plans.getMyUpcomingPlans, args);
  const ranks = useQuery(api.points.myRanks, args);
  const experiences = useQuery(api.experiences.listExperiences, {});
  const getProfile = useAction(api.memory.getMyProfile);
  const [knows, setKnows] = useState<string[] | null | undefined>(undefined);
  const [crewIndex, setCrewIndex] = useState(0);
  const [openGoji, setOpenGoji] = useState<string | null>(null);
  const [focusPlanId, setFocusPlanId] = useState<string | null>(null);
  const [planningPick, setPlanningPick] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const loadKnows = useCallback(() => {
    if (!userId) return;
    setKnows(undefined);
    getProfile({ userId: userId as Id<"users"> }).then(setKnows, () => setKnows(null));
  }, [getProfile, userId]);

  useEffect(loadKnows, [loadKnows]);

  const crew = groups?.[Math.min(crewIndex, groups.length - 1)];
  const activePlans = plans ?? [];
  const nextPlan = activePlans.find((p) => p._id === focusPlanId) ?? activePlans.find((p) => p.status === "voting" || p.status === "generating") ?? activePlans[0];
  const range = useMemo(() => {
    const from = Date.now();
    return { from, to: from + 7 * 24 * 60 * 60 * 1000 };
  }, []);
  const windows = useQuery(api.availability.findFreeWindows, crew && planningPick ? { groupId: crew._id, ...range, minHours: 2 } : "skip");
  const createPlan = useMutation(api.plans.createPlan);
  const sendToCrew = async () => {
    if (!crew || !planningPick || selectedWindow === null || !windows?.[selectedWindow]) return;
    setSending(true);
    setPlanError(null);
    try {
      const planId = await createPlan({
        userId: userId as Id<"users">,
        groupId: crew._id,
        window: windows[selectedWindow],
        seedExperienceId: planningPick as Id<"experiences">,
      });
      setFocusPlanId(planId);
      setPlanningPick(null);
      setSelectedWindow(null);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Couldn't send it to your crew. Try again.");
    } finally {
      setSending(false);
    }
  };
  const vibes = new Set((user?.vibes ?? []).map((v) => v.toLowerCase()));
  const memoryText = (knows ?? []).join(" ").toLowerCase();
  const budget = user?.budgetMax ?? Infinity;
  const crewSize = crew?.members.length ?? 1;
  const picks = (experiences ?? [])
    .filter((e) => e.minGroup <= crewSize && crewSize <= e.maxGroup)
    .map((e) => {
      const matched = e.tags.filter((t) => vibes.has(t.toLowerCase()));
      const remembered = e.tags.filter((t) => memoryText.includes(t.toLowerCase().replace(/-/g, " ")) || memoryText.includes(t.toLowerCase()));
      const fits = e.pricePerPerson <= budget;
      return { e, matched: [...new Set([...matched, ...remembered])], fits, score: matched.length * 2 + remembered.length * 2 + (fits ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score || a.e.pricePerPerson - b.e.pricePerPerson)
    .slice(0, MAX_PICKS);

  const previews = useGojiPreviews(
    userId,
    picks.map(({ e, matched }) => ({ ideaKey: `exp:${e._id}`, novel: matched.length === 0 })),
  );

  if (loading) {
    return (
      <Screen>
        <LoadingState testID="home-loading" />
      </Screen>
    );
  }
  if (!userId) {
    return (
      <Screen>
        <ErrorState testID="home-error" message="Join your school first to get picks." onRetry={() => router.replace("/onboarding/school")} />
      </Screen>
    );
  }

  const why = (matched: string[]) => (matched.length > 0 ? `You like ${matched[0]}` : "Something new");

  const planWith = (experienceId: string) => {
    if (!crew) return router.push("/group/new");
    setPlanError(null);
    setSelectedWindow(null);
    setPlanningPick(planningPick === experienceId ? null : experienceId);
  };

  const gap = ranks && ranks.crewRank && ranks.crewRank > 1 ? Math.round(((ranks.leaderAvg ?? 0) - (ranks.crewAvg ?? 0)) * 10) / 10 : null;

  return (
    <Screen testID="recommended-screen" contentStyle={styles.screen}>
      <View style={styles.header}>
        <Title testID="home-greeting" style={{ flex: 1 }}>
          For you, {user?.name ?? "friend"}
        </Title>
        {user ? <PointsPill testID="home-points" points={user.points} /> : null}
      </View>

      {ranks?.crewRank ? (
        <Text testID="home-crew-rank" style={styles.rank} onPress={() => router.push("/(tabs)/leaderboard")}>
          🏆 {ranks.crewName} is #{ranks.crewRank} at {ranks.school}
          {gap !== null ? ` · ${gap} pts behind ${ranks.leaderName}` : ""}
        </Text>
      ) : null}

      {plans === undefined ? null : nextPlan ? (
        <Card testID="home-up-next" tone="accent" style={styles.card}>
          <Text testID="home-crew-next-plan" style={styles.eyebrow}>
            Up next · {nextPlan.groupName}
          </Text>
          {activePlans.length > 1 ? (
            <View style={styles.chips}>
              {activePlans.map((p, i) => (
                <Chip
                  key={p._id}
                  testID={`home-plan-chip-${i}`}
                  label={p.winner ? cleanTitle(p.winner.title) : p.status === "generating" ? "New ideas" : "Vote"}
                  selected={p._id === nextPlan._id}
                  onPress={() => setFocusPlanId(p._id)}
                />
              ))}
            </View>
          ) : null}
          <PlanPanel key={nextPlan._id} planId={nextPlan._id} inline />
        </Card>
      ) : null}

      <SectionHeader title="Picked for you" testID="picks-header" />
      {groups && groups.length > 1 ? (
        <View style={styles.chips}>
          {groups.map((g, i) => (
            <Chip key={g._id} testID={`picks-crew-${i}`} label={g.name} selected={g._id === crew?._id} onPress={() => setCrewIndex(i)} />
          ))}
        </View>
      ) : null}
      {groups !== undefined && groups.length === 0 ? (
        <EmptyState
          testID="crew-empty"
          emoji="👯"
          title="Start a crew first"
          body="Plans are made with friends."
          actionLabel="Start a crew"
          actionTestID="crew-empty-action"
          onAction={() => router.push("/group/new")}
        />
      ) : null}
      {experiences === undefined || user === undefined ? (
        <LoadingState testID="picks-loading" label="Finding ideas…" />
      ) : picks.length === 0 ? (
        <EmptyState
          testID="picks-empty"
          emoji="🧭"
          title="No picks yet"
          actionLabel={crew ? "Plan an outing" : undefined}
          actionTestID="picks-empty-action"
          onAction={crew ? () => router.push(`/group/${crew._id}`) : undefined}
        />
      ) : (
        picks.map(({ e, matched }, i) => (
          <Card key={e._id} testID={`pick-card-${i}`} style={styles.card}>
            <View style={styles.row}>
              <Text testID={`pick-title-${i}`} style={[styles.title, { flex: 1 }]} numberOfLines={1}>
                {cleanTitle(e.title)}
              </Text>
              <GojiChip
                testID={`pick-gojis-${i}`}
                preview={previews.get(`exp:${e._id}`)}
                open={openGoji === e._id}
                onPress={() => setOpenGoji(openGoji === e._id ? null : e._id)}
              />
            </View>
            <Text style={styles.muted} numberOfLines={1}>
              {e.businessName || "Local spot"} · ${e.pricePerPerson}/person
            </Text>
            <Text testID={`pick-why-${i}`} style={styles.muted} numberOfLines={1}>
              {why(matched)}
            </Text>
            {openGoji === e._id ? <GojiDetails testID={`pick-gojis-${i}-breakdown`} preview={previews.get(`exp:${e._id}`)} /> : null}
            {planningPick === e._id ? (
              <View testID={`pick-planner-${i}`} style={styles.card}>
                <Text style={styles.eyebrow}>Pick a time</Text>
                {windows === undefined ? (
                  <LoadingState label="Finding times that work…" testID="windows-loading" />
                ) : windows.length === 0 ? (
                  <Text testID="windows-empty" style={styles.muted}>No shared free time in the next 7 days.</Text>
                ) : (
                  <View style={styles.chips}>
                    {windows.map((win, w) => (
                      <Chip key={win.start} testID={`free-window-${w}`} label={formatWindow(win)} selected={selectedWindow === w} onPress={() => setSelectedWindow(w)} />
                    ))}
                  </View>
                )}
                {planError ? <ErrorState testID="plan-error" message={planError} onRetry={sendToCrew} /> : null}
                <Button
                  testID="plan-outing-button"
                  label={`Send to ${crew?.name ?? "your crew"} to vote`}
                  loading={sending}
                  disabled={selectedWindow === null}
                  onPress={sendToCrew}
                />
              </View>
            ) : (
              <Button
                testID={`pick-plan-${i}`}
                label={crew ? `Plan with ${crew.name}` : "Start a crew"}
                variant={i === 0 && !nextPlan ? "primary" : "secondary"}
                onPress={() => planWith(e._id)}
              />
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  card: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rank: { ...type.label, fontSize: font.size.md, marginTop: -spacing.md },
  eyebrow: type.eyebrow,
  title: type.heading,
  muted: type.muted,
});
