import type { GenericId as Id } from "convex/values";
import { useAction, useQuery } from "convex/react";
import { useRouter, type ErrorBoundaryProps } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import GojiChip, { GojiDetails, useGojiPreviews } from "../../components/GojiChip";
import PointsPill from "../../components/PointsPill";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { colors, font, spacing, type } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { formatWindow } from "../../lib/format";
import { useUserId } from "../../lib/session";

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

  const loadKnows = useCallback(() => {
    if (!userId) return;
    setKnows(undefined);
    getProfile({ userId: userId as Id<"users"> }).then(setKnows, () => setKnows(null));
  }, [getProfile, userId]);

  useEffect(loadKnows, [loadKnows]);

  const crew = groups?.[Math.min(crewIndex, groups.length - 1)];
  const nextPlan = plans?.find((p) => p.status === "voting" || p.status === "locked");
  const vibes = new Set((user?.vibes ?? []).map((v) => v.toLowerCase()));
  const memoryText = (knows ?? []).join(" ").toLowerCase();
  const budget = user?.budgetMax ?? Infinity;
  const crewSize = crew?.members.length ?? 1;
  const sized = (experiences ?? []).filter((e) => e.minGroup <= crewSize && crewSize <= e.maxGroup);
  const picks = (sized.length > 0 ? sized : experiences ?? [])
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
    router.push({ pathname: "/group/[groupId]", params: { groupId: crew._id, pick: experienceId } });
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
        <Card testID="home-up-next" tone="accent" style={styles.card} onPress={() => router.push(`/plan/${nextPlan._id}`)}>
          <Text style={styles.eyebrow}>Up next · {nextPlan.groupName}</Text>
          <Text testID="home-crew-next-plan" style={styles.title} numberOfLines={1}>
            {nextPlan.status === "voting" ? "Vote on 3 ideas" : nextPlan.winner?.title ?? "Your crew's outing"}
          </Text>
          <Text style={styles.muted}>{formatWindow(nextPlan.window)}</Text>
          {nextPlan.status === "voting" ? (
            <Button testID="home-vote-now" label="Vote now" onPress={() => router.push(`/plan/${nextPlan._id}`)} />
          ) : (
            <Button
              testID="home-crew-checkin"
              label="Check in"
              onPress={() => router.push({ pathname: "/camera", params: { planId: nextPlan._id, groupId: nextPlan.groupId } })}
            />
          )}
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
                {e.title}
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
            <Button
              testID={`pick-plan-${i}`}
              label={crew ? `Plan with ${crew.name}` : "Start a crew"}
              variant={i === 0 && !nextPlan ? "primary" : "secondary"}
              onPress={() => planWith(e._id)}
            />
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
