import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { Button, Screen, Subtitle, Title } from "../../components/ui";
import { colors, font, radius, spacing } from "../../constants/theme";
import { useUserId } from "../../lib/session";
import { mockDelay } from "../../lib/mock";

const USE_MOCK = true;

type JoinGroupArgs = { userId: Id<"users">; inviteCode: string };
// TODO(convex): swap to api.groups.joinGroup once it lands
const joinGroupRef = makeFunctionReference<"mutation", JoinGroupArgs, Id<"groups">>("groups:joinGroup");

async function mockJoin(args: JoinGroupArgs): Promise<Id<"groups">> {
  await mockDelay(null, 600);
  if (args.inviteCode !== "GOJI42") throw new Error("Invalid invite code");
  return "group-hack-crew" as Id<"groups">;
}

export default function JoinGroupScreen() {
  const router = useRouter();
  const { userId } = useUserId();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joinLive = useMutation(joinGroupRef);
  const joinGroup = USE_MOCK ? mockJoin : joinLive;

  const submit = async () => {
    if (code.length !== 6) {
      setError("Codes are 6 characters long.");
      return;
    }
    if (!USE_MOCK && !userId) {
      setError("You need to finish onboarding first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const groupId = await joinGroup({ userId: (userId ?? "user-uma") as Id<"users">, inviteCode: code });
      router.replace(`/group/${groupId}`);
    } catch {
      setError("That code didn't work. Check it and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen testID="join-group-screen">
      <Stack.Screen options={{ title: "Join a group" }} />
      <Title testID="join-group-title">Join with code</Title>
      <Subtitle>Ask a friend for their 6-character invite code.</Subtitle>
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
      <Button testID="join-submit" label="Join" loading={loading} onPress={submit} />
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
