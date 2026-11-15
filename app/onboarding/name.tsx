import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation } from "convex/react";
import { Button, Card, ErrorState, Screen, SectionHeader, Subtitle } from "../../components/ui";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { mockDelay } from "../../lib/mock";
import { setUserId } from "../../lib/session";

const USE_MOCK = true;

// TODO(convex): swap to api.users.createUser once it lands
const createUserRef = makeFunctionReference<"mutation", { name: string }, Id<"users">>("users:createUser");

const AVATARS = ["🐱", "🦊", "🐼", "🐸", "🦄", "🐙", "🦁", "🐯", "🐵", "🐧", "🦉", "🐳"];

export default function NameScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLive = useMutation(createUserRef);
  const createUser = USE_MOCK
    ? (args: { name: string }) => mockDelay("mock_user_uma" as Id<"users">, 700)
    : createLive;

  const trimmed = name.trim();

  const onContinue = async () => {
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createUser({ name: trimmed });
      await setUserId(id);
      router.replace("/onboarding/swipe");
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
        <Text testID="name-hero-emoji" style={styles.heroEmoji}>
          {brand.emoji}
        </Text>
        <Text testID="name-title" style={styles.heroTitle}>
          Welcome to {brand.name}
        </Text>
        <Subtitle testID="name-subtitle" style={styles.center}>
          Plan hangouts with your crew, earn {brand.points} {brand.pointsEmoji} and unlock {brand.diamonds}{" "}
          {brand.diamondsEmoji}.
        </Subtitle>
      </View>

      {error ? <ErrorState testID="name-error" message={error} onRetry={onContinue} /> : null}

      <SectionHeader title="What does your floor call you?" testID="name-label" />
      <TextInput
        testID="name-input"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Uma from Unit 3"
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
  heroEmoji: { fontSize: 72 },
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
