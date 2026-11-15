import { useRouter, type ErrorBoundaryProps } from "expo-router";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { StyleSheet, Text, View } from "react-native";
import PointsPill from "../../components/PointsPill";
import SponsoredBadge from "../../components/SponsoredBadge";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { api } from "../../convex/_generated/api";
import { brand, colors, font, spacing } from "../../constants/theme";
import { formatWindow } from "../../lib/format";
import { useMockQuery } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;

type User = { _id: Id<"users">; name: string; points: number; diamonds: number; vibes: string[]; homeArea: string; budgetMax: number };
type MyRanks = {
  crewRank: number | null;
  crewName: string | null;
  crewAvg: number | null;
  leaderName: string | null;
  leaderAvg: number | null;
  school: string;
} | null;
type CrewPlan = {
  _id: Id<"plans">;
  groupId: Id<"groups">;
  groupName: string;
  status: "generating" | "voting" | "locked" | "done" | "cancelled";
  winner: { title: string } | null;
};
type UpcomingPlan = { _id: Id<"plans">; groupName: string; title: string; window: { start: number; end: number } };
type Sponsor = { _id: Id<"sponsors">; business: string; offer: string; rewardCost: number; priceLevel: number; active: boolean };

// TODO(convex): swap to api.users.getUser once it lands
const getUserRef = makeFunctionReference<"query", { userId: Id<"users"> }, User | null>("users:getUser");
// TODO(convex): swap to api.plans.getGroupPlans (per group from groups.getMyGroups) once it lands; the live query should return upcoming locked plans with groupName and winning option title
const getUpcomingRef = makeFunctionReference<"query", { userId: Id<"users"> }, UpcomingPlan[]>("plans:getUpcomingForUser");
// TODO(convex): swap to api.sponsors.listActive once it lands
const listSponsorsRef = makeFunctionReference<"query", Record<string, never>, Sponsor[]>("sponsors:listActive");

const MOCK_USER: User = {
  _id: "mock_uma" as Id<"users">,
  name: "Uma",
  points: 1240,
  diamonds: 2,
  vibes: ["cozy", "foodie"],
  homeArea: "Mission",
  budgetMax: 30,
};
const MOCK_RANKS: MyRanks = { crewRank: 2, crewName: "Hack Crew", crewAvg: 320, leaderName: "Taco Tuesday Crew", leaderAvg: 340, school: "Berkeley" };
const MOCK_CREW_PLANS: CrewPlan[] = [
  { _id: "plan-locked-1" as Id<"plans">, groupId: "mock_hack_crew" as Id<"groups">, groupName: "Hack Crew", status: "locked", winner: { title: "Escape SF: The Heist Room" } },
];
const NOW = Date.now();
const MOCK_UPCOMING: UpcomingPlan[] = [
  { _id: "plan-locked-1" as Id<"plans">, groupName: "Hack Crew", title: "Escape SF: The Heist Room", window: { start: NOW + 2 * 86400000, end: NOW + 2 * 86400000 + 3 * 3600000 } },
  { _id: "plan-locked-2" as Id<"plans">, groupName: "Hack Crew", title: "Sunset at Twin Peaks + Tacos", window: { start: NOW + 5 * 86400000, end: NOW + 5 * 86400000 + 4 * 3600000 } },
];
const MOCK_SPONSORS: Sponsor[] = [
  { _id: "sp1" as Id<"sponsors">, business: "Ritual Coffee Roasters", offer: "Free pastry with any drink", rewardCost: 1, priceLevel: 2, active: true },
];

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen>
      <ErrorState testID="home-load-error" message="Couldn't load your home screen." onRetry={retry} />
    </Screen>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { userId, loading } = useUserId();
  const skip = USE_MOCK || !userId;
  const args = { userId: userId as Id<"users"> };

  const liveUser = useQuery(getUserRef, skip ? "skip" : args);
  const liveRanks = useQuery(api.points.myRanks, skip ? "skip" : args);
  const liveCrewPlans = useQuery(api.plans.getMyUpcomingPlans, skip ? "skip" : args);
  const liveUpcoming = useQuery(getUpcomingRef, skip ? "skip" : args);
  const liveSponsors = useQuery(listSponsorsRef, USE_MOCK ? "skip" : {});
  const mockUser = useMockQuery(MOCK_USER, USE_MOCK);
  const mockRanks = useMockQuery(MOCK_RANKS, USE_MOCK, 700);
  const mockCrewPlans = useMockQuery(MOCK_CREW_PLANS, USE_MOCK, 700);
  const mockUpcoming = useMockQuery(MOCK_UPCOMING, USE_MOCK, 800);
  const mockSponsors = useMockQuery(MOCK_SPONSORS, USE_MOCK, 900);

  const user = USE_MOCK ? mockUser : liveUser;
  const ranks: MyRanks | undefined = USE_MOCK ? mockRanks : liveRanks;
  const crewPlans: CrewPlan[] | undefined = USE_MOCK ? mockCrewPlans : liveCrewPlans;
  const nextPlan = crewPlans?.find((p) => p.status === "locked");
  const upcoming = USE_MOCK ? mockUpcoming : liveUpcoming;
  const sponsors = USE_MOCK ? mockSponsors : liveSponsors;
  const sponsor = sponsors?.[0];

  if (!USE_MOCK && loading) {
    return (
      <Screen>
        <LoadingState testID="home-loading" />
      </Screen>
    );
  }
  if (!USE_MOCK && !userId) {
    return (
      <Screen>
        <ErrorState testID="home-error" message="You're signed out. Restart the app to sign in." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Title testID="home-greeting">Hey {user?.name ?? "there"} 👋</Title>
          <Text style={styles.sub}>Ready to get your crew out?</Text>
        </View>
        {user ? (
          <View style={styles.badges}>
            <PointsPill testID="home-points" points={user.points} />
          </View>
        ) : null}
      </View>

      {ranks === undefined || crewPlans === undefined ? (
        <LoadingState testID="crew-loading" label="Checking your crew's rank…" />
      ) : !ranks?.crewRank ? (
        <EmptyState
          testID="crew-empty"
          emoji="🧭"
          title="Get your crew on the board"
          body={`Start or join a crew, then check in on a group outing to earn ${brand.points}.`}
          actionLabel="Go to Groups"
          actionTestID="crew-empty-action"
          onAction={() => router.push("/groups")}
        />
      ) : (
        <Card testID="home-crew-card" tone="accent" style={styles.crewCard}>
          <Text testID="home-crew-rank" style={styles.crewRank}>
            Your crew is #{ranks.crewRank} at {ranks.school}
          </Text>
          <Text testID="home-crew-name" style={styles.planWindow}>
            {ranks.crewName} · {Math.round(ranks.crewAvg ?? 0)} avg {brand.points} this week
          </Text>
          <Text testID="home-crew-rival" style={styles.planWindow}>
            {ranks.crewRank === 1
              ? `Your crew leads every friend group at ${ranks.school}. Hold the lead!`
              : `Your crew vs. theirs: ${Math.max(0, Math.round((ranks.leaderAvg ?? 0) - (ranks.crewAvg ?? 0)))} ${brand.points} behind ${ranks.leaderName} for #1 at ${ranks.school}`}
          </Text>
          {nextPlan ? (
            <>
              <Text testID="home-crew-next-plan" style={styles.planWindow}>
                Next up: {nextPlan.winner?.title ?? "your crew's outing"} with {nextPlan.groupName}
              </Text>
              <Button
                testID="home-crew-checkin"
                label="Check in on your crew's outing"
                icon="📸"
                onPress={() => router.push({ pathname: "/camera", params: { planId: nextPlan._id, groupId: nextPlan.groupId } })}
              />
            </>
          ) : (
            <Button testID="home-crew-plan" label="Plan your crew's next outing" variant="secondary" onPress={() => router.push("/groups")} />
          )}
        </Card>
      )}

      <SectionHeader title="Upcoming plans" testID="upcoming-header" />
      {upcoming === undefined ? (
        <LoadingState testID="upcoming-loading" />
      ) : upcoming.length === 0 ? (
        <EmptyState testID="upcoming-empty" emoji="🗓️" title="No plans locked yet" body="Start a plan with your group and vote on what to do." actionLabel="Go to Groups" actionTestID="upcoming-empty-action" onAction={() => router.push("/groups")} />
      ) : (
        upcoming.map((p, i) => (
          <Card key={p._id} testID={`upcoming-plan-${i}`} onPress={() => router.push(`/plan/${p._id}`)}>
            <Text style={styles.planGroup}>{p.groupName}</Text>
            <Text style={styles.planTitle}>{p.title}</Text>
            <Text style={styles.planWindow}>🗓️ {formatWindow(p.window)}</Text>
          </Card>
        ))
      )}

      {sponsor ? (
        <Card testID="home-sponsored-card" tone="muted" onPress={() => router.push(`/sponsor/${sponsor._id}`)}>
          <SponsoredBadge />
          <Text style={styles.planTitle}>{sponsor.business}</Text>
          <Text style={styles.planWindow}>{sponsor.offer}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sub: { fontSize: font.size.md, color: colors.textMuted, marginTop: spacing.xs },
  badges: { alignItems: "flex-end", gap: spacing.sm },
  crewCard: { gap: spacing.sm },
  crewRank: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark },
  planGroup: { fontSize: font.size.xs, fontWeight: font.weight.heavy, color: colors.accent, letterSpacing: 0.5 },
  planTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, marginTop: spacing.xs },
  planWindow: { fontSize: font.size.md, color: colors.textMuted, marginTop: spacing.xs },
});
