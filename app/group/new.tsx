import type { GenericId as Id } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Screen, Subtitle, Title } from "../../components/ui";
import { SchoolHeader } from "../../components/SchoolBadge";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { useUserId } from "../../lib/session";

type CreateGroupResult = { groupId: Id<"groups">; inviteCode: string };

export default function NewGroupScreen() {
  const router = useRouter();
  const { userId } = useUserId();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateGroupResult | null>(null);
  const [copied, setCopied] = useState(false);

  const createGroup = useMutation(api.groups.createGroup);
  const user = useQuery(api.users.getUser, userId ? { userId: userId as Id<"users"> } : "skip");
  const school = user?.homeArea ?? null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give your crew a name first.");
      return;
    }
    if (!userId) {
      setError("You need to finish onboarding first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCreated(await createGroup({ userId: userId as Id<"users">, name: trimmed }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start your crew.");
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
      await Share.share({ message: `Join our crew "${name.trim()}"${school ? ` at ${school}` : ""} on ${brand.name} ${brand.emoji} with code ${created.inviteCode}` });
    } catch {}
  };

  return (
    <Screen testID="new-group-screen">
      <Stack.Screen options={{ title: "New crew" }} />
      <SchoolHeader school={school} testID="new-group-school-header" />
      {created ? (
        <>
          <Title testID="group-created-title">{school ? `You started a crew at ${school} 🎉` : "Crew started 🎉"}</Title>
          <Subtitle testID="group-created-subtitle">Share this code with your friend group so they can join and start climbing{school ? ` the ${school} board` : ""}.</Subtitle>
          <Card tone="accent" style={styles.codeCard}>
            <Text style={styles.codeLabel}>Invite code</Text>
            <Text testID="invite-code" style={styles.code} selectable>
              {created.inviteCode}
            </Text>
          </Card>
          <Button testID="copy-invite-code" label={copied ? "Copied!" : "Copy code"} variant="secondary" onPress={copy} />
          <Button testID="share-invite-code" label="Share" variant="secondary" onPress={share} />
          <Button testID="go-to-group" label="Go to your crew" onPress={() => router.replace(`/group/${created.groupId}`)} />
        </>
      ) : (
        <>
          <Title testID="new-group-title">{school ? `Start a crew at ${school}` : "Start a crew"}</Title>
          <Subtitle testID="new-group-subtitle">A crew is your friend group. Name it, invite your friends with a code, and take on the other crews{school ? ` at ${school}` : ""}.</Subtitle>
          <View style={styles.field}>
            <TextInput
              testID="group-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Boba Bandits"
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
          <Button testID="create-group-submit" label="Start crew" loading={loading} onPress={submit} />
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
