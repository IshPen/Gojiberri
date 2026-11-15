import { useRouter } from "expo-router";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { StyleSheet, Text, View } from "react-native";
import PointsPill from "../../components/PointsPill";
import QuestCard from "../../components/QuestCard";
import SponsoredBadge from "../../components/SponsoredBadge";
import { Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Title } from "../../components/ui";
import { colors, font, spacing } from "../../constants/theme";
import { formatWindow } from "../../lib/format";
import { useMockQuery } from "../../lib/mock";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;

type User = { _id: Id<"users">; name: string; points: number; diamonds: number; streak: number; vibes: string[]; homeArea: string; budgetMax: number };
type TodayQuest = {
  quest: { _id: Id<"soloQuests">; userId: Id<"users">; date: string; placeId: Id<"places">; prompt: string; status: "open" | "done" | "skipped" };
  place: { _id: Id<"places">; name: string; area: string; category: string; priceLevel: number };
} | null;
type UpcomingPlan = { _id: Id<"plans">; groupName: string; title: string; window: { start: number; end: number } };
type Sponsor = { _id: Id<"sponsors">; business: string; offer: string; rewardCost: number; priceLevel: number; active: boolean };

// TODO(convex): swap to api.users.getUser once it lands
const getUserRef = makeFunctionReference<"query", { userId: Id<"users"> }, User | null>("users:getUser");
// TODO(convex): swap to api.solo.getToday once it lands
const getTodayRef = makeFunctionReference<"query", { userId: Id<"users"> }, TodayQuest>("solo:getToday");
// TODO(convex): swap to api.plans.getGroupPlans (per group from groups.getMyGroups) once it lands; the live query should return upcoming locked plans with groupName and winning option title
const getUpcomingRef = makeFunctionReference<"query", { userId: Id<"users"> }, UpcomingPlan[]>("plans:getUpcomingForUser");
// TODO(convex): swap to api.sponsors.listActive once it lands
const listSponsorsRef = makeFunctionReference<"query", Record<string, never>, Sponsor[]>("sponsors:listActive");

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
const MOCK_TODAY: TodayQuest = {
  quest: {
    _id: "mock_quest" as Id<"soloQuests">,
    userId: "mock_uma" as Id<"users">,
    date: "2026-11-15",
    placeId: "mock_place_1" as Id<"places">,
    prompt: "Try the cardamom bun at Tartine Bakery",
    status: "open",
  },
  place: { _id: "mock_place_1" as Id<"places">, name: "Tartine Bakery", area: "Mission", category: "food", priceLevel: 2 },
};
const NOW = Date.now();
const MOCK_UPCOMING: UpcomingPlan[] = [
  { _id: "plan-locked-1" as Id<"plans">, groupName: "Hack Crew", title: "Escape SF: The Heist Room", window: { start: NOW + 2 * 86400000, end: NOW + 2 * 86400000 + 3 * 3600000 } },
  { _id: "plan-locked-2" as Id<"plans">, groupName: "Hack Crew", title: "Sunset at Twin Peaks + Tacos", window: { start: NOW + 5 * 86400000, end: NOW + 5 * 86400000 + 4 * 3600000 } },
];
const MOCK_SPONSORS: Sponsor[] = [
  { _id: "sp1" as Id<"sponsors">, business: "Ritual Coffee Roasters", offer: "Free pastry with any drink", rewardCost: 3, priceLevel: 2, active: true },
];

export default function HomeScreen() {
  const router = useRouter();
  const { userId, loading } = useUserId();
  const skip = USE_MOCK || !userId;
  const args = { userId: userId as Id<"users"> };

  const liveUser = useQuery(getUserRef, skip ? "skip" : args);
  const liveToday = useQuery(getTodayRef, skip ? "skip" : args);
  const liveUpcoming = useQuery(getUpcomingRef, skip ? "skip" : args);
  const liveSponsors = useQuery(listSponsorsRef, USE_MOCK ? "skip" : {});
  const mockUser = useMockQuery(MOCK_USER, USE_MOCK);
  const mockToday = useMockQuery(MOCK_TODAY, USE_MOCK, 700);
  const mockUpcoming = useMockQuery(MOCK_UPCOMING, USE_MOCK, 800);
  const mockSponsors = useMockQuery(MOCK_SPONSORS, USE_MOCK, 900);

  const user = USE_MOCK ? mockUser : liveUser;
  const today = USE_MOCK ? mockToday : liveToday;
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
          <Text style={styles.sub}>Ready for a side quest?</Text>
        </View>
        {user ? (
          <View style={styles.badges}>
            <PointsPill testID="home-points" points={user.points} />
            <View testID="home-streak" style={styles.streak}>
              <Text style={styles.streakText}>🔥 {user.streak}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {today === undefined ? (
        <LoadingState testID="quest-loading" label="Finding your quest…" />
      ) : today === null ? (
        <EmptyState testID="quest-empty" emoji="⏰" title="Your quest drops at 8am" body="Check back tomorrow morning for a new Gojiberri quest." />
      ) : (
        <QuestCard
          prompt={today.quest.prompt}
          placeName={today.place.name}
          area={today.place.area}
          priceLevel={today.place.priceLevel}
          streak={user?.streak ?? 0}
          done={today.quest.status === "done"}
          onCheckIn={() => router.push(`/camera?questId=${today.quest._id}`)}
        />
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
  streak: { backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  streakText: { fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.text },
  planGroup: { fontSize: font.size.xs, fontWeight: font.weight.heavy, color: colors.accent, letterSpacing: 0.5 },
  planTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, marginTop: spacing.xs },
  planWindow: { fontSize: font.size.md, color: colors.textMuted, marginTop: spacing.xs },
});
