import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Slider from "@react-native-community/slider";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation } from "convex/react";
import { Button, Card, Chip, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { colors, font, spacing } from "../../constants/theme";
import { readBusyBlocks, type TimeBlock } from "../../lib/calendar";
import { mockDelay } from "../../lib/mock";
import { registerForPushToken } from "../../lib/notifications";
import { useUserId } from "../../lib/session";

const USE_MOCK = true;

type PrefsArgs = { userId: Id<"users">; budgetMax: number; homeArea: string; diet: string[]; vibes: string[] };
type BlocksArgs = { userId: Id<"users">; blocks: TimeBlock[] };
type TokenArgs = { userId: Id<"users">; token: string };
// TODO(convex): swap to api.users.updatePreferences once it lands
const updatePreferencesRef = makeFunctionReference<"mutation", PrefsArgs, null>("users:updatePreferences");
// TODO(convex): swap to api.users.setBusyBlocks once it lands
const setBusyBlocksRef = makeFunctionReference<"mutation", BlocksArgs, null>("users:setBusyBlocks");
// TODO(convex): swap to api.users.setPushToken once it lands
const setPushTokenRef = makeFunctionReference<"mutation", TokenArgs, null>("users:setPushToken");

const AREAS = ["Mission", "SoMa", "Hayes Valley", "Marina", "North Beach", "Castro", "Sunset", "Richmond", "Nob Hill", "Dogpatch"];
const DIETS = ["vegetarian", "vegan", "gluten-free", "halal", "kosher", "no restrictions"];
const VIBES = ["cozy", "active", "artsy", "foodie", "nightlife", "outdoors", "chill", "adventurous"];

export default function PreferencesScreen() {
  const router = useRouter();
  const { userId, loading } = useUserId();
  const [budget, setBudget] = useState(40);
  const [area, setArea] = useState("Mission");
  const [diet, setDiet] = useState<string[]>(["no restrictions"]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLive = useMutation(updatePreferencesRef);
  const blocksLive = useMutation(setBusyBlocksRef);
  const tokenLive = useMutation(setPushTokenRef);
  const updatePreferences = USE_MOCK ? (args: PrefsArgs) => mockDelay(null, 700) : updateLive;
  const setBusyBlocks = USE_MOCK ? (args: BlocksArgs) => mockDelay(null, 300) : blocksLive;
  const setPushToken = USE_MOCK ? (args: TokenArgs) => mockDelay(null, 100) : tokenLive;

  if (loading) return <Screen testID="preferences-screen"><LoadingState testID="preferences-loading" /></Screen>;

  if (!userId) {
    return (
      <Screen testID="preferences-screen">
        <ErrorState
          testID="preferences-no-user"
          message="We couldn't find your profile. Let's start over."
          onRetry={() => router.replace("/onboarding/name")}
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
        setCalendarStatus("Permission denied, we'll use demo availability");
        return;
      }
      await setBusyBlocks({ userId: userId as Id<"users">, blocks });
      setCalendarStatus(`Connected · ${blocks.length} busy blocks`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read your calendar.");
    } finally {
      setConnecting(false);
    }
  };

  const onFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePreferences({
        userId: userId as Id<"users">,
        budgetMax: budget,
        homeArea: area,
        diet: diet.length ? diet : ["no restrictions"],
        vibes,
      });
      const token = await registerForPushToken();
      if (token) await setPushToken({ userId: userId as Id<"users">, token });
      router.replace("/(tabs)/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your preferences.");
      setSaving(false);
    }
  };

  return (
    <Screen
      testID="preferences-screen"
      footer={<Button testID="preferences-finish" label="Finish" onPress={onFinish} loading={saving} />}
    >
      <Title testID="preferences-title">Almost there</Title>
      <Subtitle testID="preferences-subtitle">Tell Gojiberri what you like so plans fit you.</Subtitle>

      {error ? <ErrorState testID="preferences-error" message={error} onRetry={() => setError(null)} /> : null}

      <SectionHeader title="Budget" testID="budget-header" />
      <Card testID="budget-card">
        <Text testID="budget-value" style={styles.budget}>
          ${budget} max per outing
        </Text>
        <Slider
          testID="budget-slider"
          minimumValue={10}
          maximumValue={100}
          step={5}
          value={budget}
          onValueChange={setBudget}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
          style={styles.slider}
        />
        <View style={styles.sliderRange}>
          <Text style={styles.rangeText}>$10</Text>
          <Text style={styles.rangeText}>$100</Text>
        </View>
      </Card>

      <SectionHeader title="Home area" testID="area-header" />
      <View style={styles.chips}>
        {AREAS.map((a) => (
          <Chip key={a} testID={`area-chip-${a}`} label={a} selected={area === a} onPress={() => setArea(a)} />
        ))}
      </View>

      <SectionHeader title="Diet" testID="diet-header" />
      <View style={styles.chips}>
        {DIETS.map((d) => (
          <Chip key={d} testID={`diet-chip-${d}`} label={d} selected={diet.includes(d)} onPress={() => toggleDiet(d)} />
        ))}
      </View>

      <SectionHeader title="Vibes" testID="vibes-header" />
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
            : calendarStatus ?? "We only share busy times so your crew can find a free window."}
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  calendarTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  calendarBody: { fontSize: font.size.md, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 22 },
});
