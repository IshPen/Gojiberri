import type { GenericId as Id } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { Button, Screen, Subtitle, Title } from "../../components/ui";
import { SchoolHeader } from "../../components/SchoolBadge";
import { colors, font, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { useUserId } from "../../lib/session";

export default function JoinGroupScreen() {
  const router = useRouter();
  const { userId } = useUserId();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joinGroup = useMutation(api.groups.joinGroup);
  const user = useQuery(api.users.getUser, userId ? { userId: userId as Id<"users"> } : "skip");
  const school = user?.homeArea ?? null;

  const submit = async () => {
    if (code.length !== 6) {
      setError("Codes are 6 characters long.");
      return;
    }
    if (!userId) {
      setError("You need to finish onboarding first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const groupId = await joinGroup({ userId: userId as Id<"users">, inviteCode: code });
      router.replace(`/group/${groupId}`);
    } catch {
      setError("That code didn't work. Check it and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen testID="join-group-screen">
      <Stack.Screen options={{ title: "Join a crew" }} />
      <SchoolHeader school={school} testID="join-group-school-header" />
      <Title testID="join-group-title">Join your friends' crew</Title>
      <Subtitle testID="join-group-subtitle">Ask a friend for their crew's 6-character invite code{school ? `, then compete with them at ${school}` : ""}.</Subtitle>
      <TextInput
        testID="join-code-input"
        value={code}
        onChangeText={(text) => {
          setCode(text.toUpperCase());
          setError(null);
        }}
        placeholder="GOJI42"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        style={styles.input}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error ? (
        <Text testID="join-error" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button testID="join-submit" label="Join crew" loading={loading} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    textAlign: "center",
    fontSize: font.size.hero,
    fontWeight: font.weight.heavy,
    letterSpacing: 8,
    color: colors.text,
    paddingHorizontal: spacing.lg,
  },
  error: { color: colors.danger, fontSize: font.size.md, fontWeight: font.weight.semibold, textAlign: "center" },
});
