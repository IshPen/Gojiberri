import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { Button, ErrorState, Screen, SectionHeader, Subtitle } from "../../components/ui";
import { SchoolCrest } from "../../components/SchoolBadge";
import { brand, colors, font, radius, spacing, type } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { schoolFor } from "../../lib/school";
import { setUserId } from "../../lib/session";
import { TimeoutError, withTimeout } from "../../lib/timeout";
import Basket from "../../components/Basket";

export default function NameScreen() {
  const router = useRouter();
  const { school } = useLocalSearchParams<{ school?: string }>();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createUser = useMutation(api.users.createUser);
  const pending = useRef<{ name: string; promise: Promise<Id<"users">> } | null>(null);

  const trimmed = name.trim();

  if (!school) return <Redirect href="/onboarding/school" />;
  const s = schoolFor(school);

  const onContinue = async () => {
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      if (pending.current?.name !== trimmed) pending.current = { name: trimmed, promise: createUser({ name: trimmed }) };
      const id = await withTimeout(pending.current.promise, "We couldn't reach Gojiberri. Check your connection and try again.");
      await setUserId(id);
      router.replace({ pathname: "/onboarding/swipe", params: { school } });
    } catch (e) {
      if (!(e instanceof TimeoutError)) pending.current = null;
      setError(e instanceof Error ? e.message : "Could not create your profile. Campus Wi-Fi, probably. Try again.");
      setSaving(false);
    }
  };

  return (
    <Screen
      testID="name-screen"
      footer={
        <Button
          testID="name-continue"
          label="Continue"
          onPress={onContinue}
          loading={saving}
          disabled={!trimmed}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroArt}>
          <SchoolCrest school={s.name} size={64} testID="name-school-crest" />
          <Basket size={64} progress={0.4} testID="name-basket" />
        </View>
        <Text testID="name-title" style={styles.heroTitle}>
          Welcome to the {s.name} space
        </Text>
        <Subtitle testID="name-subtitle" style={styles.center}>
          Go out with your friend group, check in together and earn {brand.points} {brand.pointsEmoji} for your crew. Every {brand.pointsPerReward} unlocks a free treat from a spot near {s.name} {brand.rewardEmoji}
        </Subtitle>
      </View>

      {error ? <ErrorState testID="name-error" message={error} onRetry={onContinue} /> : null}

      <SectionHeader title="What do your friends call you?" testID="name-label" />
      <TextInput
        testID="name-input"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Uma"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        maxLength={30}
        style={styles.input}
      />

    </Screen>
  );
}

const styles = StyleSheet.create({
  heroArt: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  hero: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.lg },
  heroTitle: { ...type.display, textAlign: "center" },
  center: { textAlign: "center" },
  input: {
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    fontSize: font.size.lg,
    color: colors.text,
  },
});
