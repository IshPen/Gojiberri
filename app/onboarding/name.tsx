import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { Button, Card, ErrorState, Screen, SectionHeader, Subtitle } from "../../components/ui";
import { SchoolCrest } from "../../components/SchoolBadge";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { schoolFor } from "../../lib/school";
import { setUserId } from "../../lib/session";

const AVATARS = ["🐱", "🦊", "🐼", "🐸", "🦄", "🐙", "🦁", "🐯", "🐵", "🐧", "🦉", "🐳"];

export default function NameScreen() {
  const router = useRouter();
  const { school } = useLocalSearchParams<{ school?: string }>();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createUser = useMutation(api.users.createUser);

  const trimmed = name.trim();

  if (!school) return <Redirect href="/onboarding/school" />;
  const s = schoolFor(school);

  const onContinue = async () => {
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createUser({ name: trimmed });
      await setUserId(id);
      router.replace({ pathname: "/onboarding/swipe", params: { school } });
    } catch (e) {
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
        <SchoolCrest school={s.name} size={64} testID="name-school-crest" />
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

      <SectionHeader title="Pick your mascot" testID="avatar-label" />
      <Card testID="avatar-grid" style={styles.grid}>
        {AVATARS.map((emoji, i) => (
          <Card
            key={emoji}
            testID={`avatar-option-${i}`}
            onPress={() => setAvatar(i)}
            tone={avatar === i ? "accent" : "muted"}
            accessibilityLabel={`Avatar ${emoji}`}
            style={styles.avatar}
          >
            <Text style={styles.avatarEmoji}>{emoji}</Text>
          </Card>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.lg },
  heroTitle: { fontSize: font.size.hero, fontWeight: font.weight.heavy, color: colors.text, textAlign: "center" },
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "center", padding: spacing.lg },
  avatar: {
    width: 64,
    height: 64,
    minHeight: minTapTarget,
    padding: 0,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  avatarEmoji: { fontSize: 32 },
});
