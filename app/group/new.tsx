import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Screen, Subtitle, Title } from "../../components/ui";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { useUserId } from "../../lib/session";
import { mockDelay } from "../../lib/mock";

const USE_MOCK = true;

type CreateGroupArgs = { userId: Id<"users">; name: string };
type CreateGroupResult = { groupId: Id<"groups">; inviteCode: string };
// TODO(convex): swap to api.groups.createGroup once it lands
const createGroupRef = makeFunctionReference<"mutation", CreateGroupArgs, CreateGroupResult>("groups:createGroup");

export default function NewGroupScreen() {
  const router = useRouter();
  const { userId } = useUserId();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateGroupResult | null>(null);
  const [copied, setCopied] = useState(false);

  const createLive = useMutation(createGroupRef);
  const createGroup = USE_MOCK
    ? (args: CreateGroupArgs) => mockDelay<CreateGroupResult>({ groupId: "group-hack-crew" as Id<"groups">, inviteCode: "GOJI42" }, 700)
    : createLive;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give your group a name first.");
      return;
    }
    if (!USE_MOCK && !userId) {
      setError("You need to finish onboarding first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCreated(await createGroup({ userId: (userId ?? "user-uma") as Id<"users">, name: trimmed }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the group.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    await Clipboard.setStringAsync(created.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (!created) return;
    try {
      await Share.share({ message: `Join "${name.trim()}" on ${brand.name} ${brand.emoji} with code ${created.inviteCode}` });
    } catch {}
  };

  return (
    <Screen testID="new-group-screen">
      <Stack.Screen options={{ title: "New group" }} />
      {created ? (
        <>
          <Title testID="group-created-title">Group created 🎉</Title>
          <Subtitle>Share this code with your friends so they can join.</Subtitle>
          <Card tone="accent" style={styles.codeCard}>
            <Text style={styles.codeLabel}>Invite code</Text>
            <Text testID="invite-code" style={styles.code} selectable>
              {created.inviteCode}
            </Text>
          </Card>
          <Button testID="copy-invite-code" label={copied ? "Copied!" : "Copy code"} variant="secondary" onPress={copy} />
          <Button testID="share-invite-code" label="Share" variant="secondary" onPress={share} />
          <Button testID="go-to-group" label="Go to group" onPress={() => router.replace(`/group/${created.groupId}`)} />
        </>
      ) : (
        <>
          <Title testID="new-group-title">Create a group</Title>
          <Subtitle>Name your crew, then invite friends with a code.</Subtitle>
          <View style={styles.field}>
            <TextInput
              testID="group-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Hack Crew"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
          </View>
          {error ? (
            <Text testID="create-group-error" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Button testID="create-group-submit" label="Create" loading={loading} onPress={submit} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
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
  error: { color: colors.danger, fontSize: font.size.md, fontWeight: font.weight.semibold, minHeight: minTapTarget / 2 },
  codeCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  codeLabel: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.textMuted, textTransform: "uppercase" },
  code: { fontSize: 48, fontWeight: font.weight.heavy, color: colors.accentDark, letterSpacing: 8 },
});
