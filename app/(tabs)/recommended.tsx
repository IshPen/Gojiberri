import type { GenericId as Id } from "convex/values";
import { useAction, useQuery } from "convex/react";
import { useRouter, type ErrorBoundaryProps } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import GojiChip, { useGojiPreviews } from "../../components/GojiChip";
import PointsPill from "../../components/PointsPill";
import { SchoolHeader } from "../../components/SchoolBadge";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { brand, colors, font, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { formatWindow } from "../../lib/format";
import { useUserId } from "../../lib/session";

const MAX_PICKS = 4;

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

  const why = (matched: string[], fits: boolean) => {
    const vibe = matched.length > 0 ? `You swiped for ${matched.slice(0, 2).join(" + ")}` : "Something outside your usual vibes";
    return fits ? `${vibe}, and it fits your $${budget} budget.` : `${vibe}.`;
  };

  const planWith = (title: string) => {
    if (!crew) return router.push("/group/new");
    router.push({ pathname: "/group/[groupId]", params: { groupId: crew._id, pick: title } });
  };

  return (
    <Screen testID="recommended-screen">
      <SchoolHeader school={user?.homeArea} testID="home-school-header" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Title testID="home-greeting">For you, {user?.name ?? "friend"}</Title>
          <Subtitle>Ideas for you and your crew, picked from your swipes and ratings.</Subtitle>
        </View>
        {user ? <PointsPill testID="home-points" points={user.points} /> : null}
      </View>

      {ranks?.crewRank ? (
        <Card testID="home-crew-rank" tone="muted" onPress={() => router.push("/(tabs)/leaderboard")} style={styles.rankRow}>
          <Text style={styles.rankText}>
            🏆 {ranks.crewName} is #{ranks.crewRank} at {ranks.school}
            {ranks.crewRank > 1 && ranks.leaderName
              ? `, ${Math.round(((ranks.leaderAvg ?? 0) - (ranks.crewAvg ?? 0)) * 10) / 10} pts behind ${ranks.leaderName}`
              : ""}
          </Text>
          <Text style={styles.rankSub}>Check in together on group outings to climb.</Text>
        </Card>
      ) : null}

      {plans === undefined ? null : nextPlan ? (
        <Card testID="home-up-next" tone="accent" style={styles.gap} onPress={() => router.push(`/plan/${nextPlan._id}`)}>
          <Text style={styles.eyebrow}>UP NEXT · {nextPlan.groupName.toUpperCase()}</Text>
          <Text testID="home-crew-next-plan" style={styles.title}>
            {nextPlan.status === "voting" ? "Your crew is voting on 3 ideas" : nextPlan.winner?.title ?? "Your crew's outing"}
          </Text>
          <Text style={styles.muted}>🗓️ {formatWindow(nextPlan.window)}</Text>
          {nextPlan.status === "voting" ? (
            <Button testID="home-vote-now" label="Vote now" icon="🗳️" onPress={() => router.push(`/plan/${nextPlan._id}`)} />
          ) : (
            <Button
              testID="home-crew-checkin"
              label={`Check in to earn ${brand.points}`}
              icon="📸"
              onPress={() => router.push({ pathname: "/camera", params: { planId: nextPlan._id, groupId: nextPlan.groupId } })}
            />
          )}
        </Card>
      ) : null}

      <SectionHeader title={crew ? `Picked for you and ${crew.name}` : "Picked for you"} testID="picks-header" />
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
          title="Plans need a crew"
          body={`Start a crew with your friends or join one with an invite code. Your crew earns ${brand.points} when you check in together.`}
          actionLabel="Start a crew"
          actionTestID="crew-empty-action"
          onAction={() => router.push("/group/new")}
        />
      ) : null}
      {experiences === undefined || user === undefined ? (
        <LoadingState testID="picks-loading" label="Picking ideas for you…" />
      ) : picks.length === 0 ? (
        <EmptyState
          testID="picks-empty"
          emoji="🧭"
          title="No picks yet"
          body="Nothing fits your crew right now. Pick a time and we'll suggest 3 outings anyway."
          actionLabel={crew ? `Plan an outing with ${crew.name}` : undefined}
          actionTestID="picks-empty-action"
          onAction={crew ? () => router.push(`/group/${crew._id}`) : undefined}
        />
      ) : (
        picks.map(({ e, matched, fits }, i) => (
          <Card key={e._id} testID={`pick-card-${i}`} style={styles.gap}>
            <View style={styles.row}>
              <Text style={styles.eyebrow} numberOfLines={1}>
                {e.businessName.toUpperCase() || "LOCAL SPOT"}
              </Text>
              <View style={styles.price}>
                <Text style={styles.priceText}>${e.pricePerPerson}/person</Text>
              </View>
            </View>
            <Text testID={`pick-title-${i}`} style={styles.title}>
              {e.title}
            </Text>
            <Text testID={`pick-why-${i}`} style={styles.muted}>
              ✨ {why(matched, fits)}
            </Text>
            <GojiChip testID={`pick-gojis-${i}`} preview={previews.get(`exp:${e._id}`)} />
            <Button
              testID={`pick-plan-${i}`}
              label={crew ? `Plan this with ${crew.name}` : "Start a crew to plan this"}
              variant={i === 0 ? "primary" : "secondary"}
              onPress={() => planWith(e.title)}
            />
          </Card>
        ))
      )}

      <SectionHeader title="Why these picks" testID="knows-home-header" />
      <Card testID="home-knows" tone="muted" style={styles.gap}>
        {knows === undefined ? (
          <Text style={styles.muted}>Reading your swipes and ratings…</Text>
        ) : knows === null ? (
          <Button testID="home-knows-retry" label="Couldn't load your taste. Try again" variant="ghost" onPress={loadKnows} />
        ) : knows.length === 0 ? (
          <Text style={styles.muted}>Swipe and rate your crew's outings and {brand.name} will learn your taste.</Text>
        ) : (
          knows.slice(0, 4).map((k, i) => (
            <Text key={i} testID={`home-knows-item-${i}`} style={styles.muted}>
              • {k}
            </Text>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  gap: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  eyebrow: { flex: 1, fontSize: font.size.xs, fontWeight: font.weight.heavy, color: colors.accent, letterSpacing: 0.5 },
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  muted: { fontSize: font.size.md, color: colors.textMuted },
  rankRow: { gap: spacing.xs, paddingVertical: spacing.lg },
  rankText: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  rankSub: { fontSize: font.size.sm, color: colors.textMuted },
  price: { backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  priceText: { fontSize: font.size.xs, fontWeight: font.weight.heavy, color: colors.success },
});
