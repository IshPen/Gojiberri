import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Slider from "@react-native-community/slider";
import type { GenericId as Id } from "convex/values";
import { useMutation } from "convex/react";
import { Button, Card, Chip, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { SchoolCrest, SchoolPicker } from "../../components/SchoolBadge";
import { colors, font, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { readBusyBlocks } from "../../lib/calendar";
import { registerForPushToken } from "../../lib/notifications";
import { useUserId } from "../../lib/session";
import { withTimeout } from "../../lib/timeout";

const DIETS = ["vegetarian", "vegan", "gluten-free", "halal", "kosher", "no restrictions"];
const VIBES = ["cozy", "active", "artsy", "foodie", "nightlife", "outdoors", "chill", "adventurous"];
const BUDGET_MIN = 5;
const BUDGET_MAX = 60;

export default function PreferencesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ school?: string }>();
  const { userId, loading } = useUserId();
  const [budget, setBudget] = useState(20);
  const [school, setSchool] = useState<string | null>(params.school ?? null);
  const [changingSchool, setChangingSchool] = useState(!params.school);
  const [diet, setDiet] = useState<string[]>(["no restrictions"]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePreferences = useMutation(api.users.updatePreferences);
  const setBusyBlocks = useMutation(api.users.setBusyBlocks);
  const setPushToken = useMutation(api.users.setPushToken);

  if (loading) return <Screen testID="preferences-screen"><LoadingState testID="preferences-loading" /></Screen>;

  if (!userId) {
    return (
      <Screen testID="preferences-screen">
        <ErrorState
          testID="preferences-no-user"
          message="We lost your profile somewhere between classes. Let's start over."
          onRetry={() => router.replace("/onboarding/school")}
        />
      </Screen>
    );
  }

  const toggle = (list: string[], set: (next: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const toggleDiet = (value: string) => {
    if (value === "no restrictions") return setDiet(["no restrictions"]);
    const without = diet.filter((v) => v !== "no restrictions");
    setDiet(without.includes(value) ? without.filter((v) => v !== value) : [...without, value]);
  };

  const onConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const blocks = await readBusyBlocks();
      if (blocks === null) {
        setCalendarStatus("No calendar access, so we'll guess around a typical class schedule");
        return;
      }
      await setBusyBlocks({ userId: userId as Id<"users">, blocks });
      setCalendarStatus(`Connected · ${blocks.length} busy blocks`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read your calendar. Try again or skip it for now.");
    } finally {
      setConnecting(false);
    }
  };

  const onFinish = async () => {
    if (!school) {
      setError("Pick your school so we can put you on the right leaderboard.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await withTimeout(
        updatePreferences({
          userId: userId as Id<"users">,
          budgetMax: budget,
          homeArea: school,
          diet: diet.length ? diet : ["no restrictions"],
          vibes,
        }),
        "We couldn't save your picks. Check your connection and try again.",
      );
      router.replace("/(tabs)/recommended");
      registerForPushToken()
        .then((token) => (token ? setPushToken({ userId: userId as Id<"users">, token }) : null))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your picks. Check your connection and try again.");
      setSaving(false);
    }
  };

  return (
    <Screen
      testID="preferences-screen"
      footer={<Button testID="preferences-finish" label={school ? `Enter the ${school} space` : "Enter your school's space"} onPress={onFinish} loading={saving} />}
    >
      <Title testID="preferences-title">{school ? `What do ${school} students like?` : "Last step, then you're in"}</Title>
      <Subtitle testID="preferences-subtitle">Your budget and vibe shape the outings we suggest for your crew{school ? ` around ${school}` : ""}, so plans fit a student wallet.</Subtitle>

      {error ? <ErrorState testID="preferences-error" message={error} onRetry={onFinish} /> : null}

      <SectionHeader title="Budget per hangout" testID="budget-header" />
      <Card testID="budget-card">
        <Text testID="budget-value" style={styles.budget}>
          ${budget} max per outing
        </Text>
        <Slider
          testID="budget-slider"
          minimumValue={BUDGET_MIN}
          maximumValue={BUDGET_MAX}
          step={5}
          value={budget}
          onValueChange={setBudget}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
          style={styles.slider}
        />
        <View style={styles.sliderRange}>
          <Text testID="budget-range-min" style={styles.rangeText}>${BUDGET_MIN}</Text>
          <Text testID="budget-range-max" style={styles.rangeText}>${BUDGET_MAX}</Text>
        </View>
      </Card>

      <SectionHeader title="Your school" testID="school-header" />
      {changingSchool || !school ? (
        <>
          <Text testID="school-hint" style={styles.hint}>
            Your crew vs. theirs, on your school's board. This is the leaderboard you climb.
          </Text>
          <SchoolPicker
            selected={school}
            onSelect={(s) => {
              setSchool(s);
              setChangingSchool(false);
            }}
          />
        </>
      ) : (
        <Card testID="school-joined" onPress={() => setChangingSchool(true)} style={styles.joined}>
          <SchoolCrest school={school} size={40} testID="school-joined-crest" />
          <View style={styles.joinedBody}>
            <Text testID="school-joined-name" style={styles.calendarTitle}>
              Repping {school}
            </Text>
            <Text style={styles.hint}>Tap to switch schools</Text>
          </View>
        </Card>
      )}

      <SectionHeader title="Diet" testID="diet-header" />
      <View style={styles.chips}>
        {DIETS.map((d) => (
          <Chip key={d} testID={`diet-chip-${d}`} label={d} selected={diet.includes(d)} onPress={() => toggleDiet(d)} />
        ))}
      </View>

      <SectionHeader title="Your weekend vibe" testID="vibes-header" />
      <View style={styles.chips}>
        {VIBES.map((v) => (
          <Chip key={v} testID={`vibe-chip-${v}`} label={v} selected={vibes.includes(v)} onPress={() => toggle(vibes, setVibes, v)} />
        ))}
      </View>

      <SectionHeader title="Calendar" testID="calendar-header" />
      <Card
        testID="connect-calendar"
        onPress={onConnect}
        disabled={connecting}
        tone={calendarStatus?.startsWith("Connected") ? "success" : "default"}
      >
        <Text style={styles.calendarTitle}>📅  Connect calendar</Text>
        <Text testID="calendar-status" style={styles.calendarBody}>
          {connecting
            ? "Reading your next 14 days…"
            : calendarStatus ?? "We only share busy times, so your crew can plan around classes and midterms."}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  budget: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.accentDark, textAlign: "center" },
  slider: { width: "100%", height: 48, marginTop: spacing.sm },
  sliderRange: { flexDirection: "row", justifyContent: "space-between" },
  rangeText: { color: colors.textMuted, fontSize: font.size.sm },
  joined: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  joinedBody: { flex: 1 },
  hint: { color: colors.textMuted, fontSize: font.size.sm, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  calendarTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  calendarBody: { fontSize: font.size.md, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 22 },
});
