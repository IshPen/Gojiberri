import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Title } from "../../components/ui";
import { colors, font, radius, spacing } from "../../constants/theme";
import { useUserId } from "../../lib/session";
import { useMockQuery } from "../../lib/mock";

const USE_MOCK = true;

type MyGroup = { _id: Id<"groups">; name: string; inviteCode: string; memberNames: string[] };
// TODO(convex): swap to api.groups.getMyGroups once it lands
const getMyGroupsRef = makeFunctionReference<"query", { userId: Id<"users"> }, MyGroup[]>("groups:getMyGroups");
const MOCK_GROUPS: MyGroup[] = [
  { _id: "group-hack-crew" as Id<"groups">, name: "Hack Crew", inviteCode: "GOJI42", memberNames: ["Uma", "Ishan", "Gauri"] },
];

export default function GroupsScreen() {
  const router = useRouter();
  const { userId } = useUserId();

  const live = useQuery(getMyGroupsRef, USE_MOCK || !userId ? "skip" : { userId: userId as Id<"users"> });
  const mock = useMockQuery(MOCK_GROUPS, USE_MOCK);
  const groups = USE_MOCK ? mock : live;

  return (
    <Screen testID="groups-screen">
      <Title testID="groups-title">Groups</Title>
      <View style={styles.actions}>
        <Button testID="create-group-button" label="Create group" icon="➕" onPress={() => router.push("/group/new")} />
        <Button testID="join-group-button" label="Join with code" variant="secondary" onPress={() => router.push("/group/join")} />
      </View>
      {groups === undefined ? (
        <LoadingState label="Loading your groups…" testID="groups-loading" />
      ) : groups === null ? (
        <ErrorState testID="groups-error" message="We couldn't load your groups." />
      ) : groups.length === 0 ? (
        <EmptyState
          testID="groups-empty"
          emoji="🍓"
          title="No groups yet"
          body="Create a group for your friends or join one with an invite code."
          actionLabel="Create group"
          actionTestID="groups-empty-action"
          onAction={() => router.push("/group/new")}
        />
      ) : (
        groups.map((group, i) => (
          <Card key={group._id} testID={`group-card-${i}`} onPress={() => router.push(`/group/${group._id}`)} style={styles.groupCard}>
            <Text testID={`group-name-${i}`} style={styles.groupName}>
              {group.name}
            </Text>
            <View style={styles.avatars}>
              {group.memberNames.map((name, j) => (
                <View key={name} testID={`group-${i}-avatar-${j}`} style={[styles.avatar, j > 0 && { marginLeft: -10 }]}>
                  <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                </View>
              ))}
            </View>
            <Text testID={`group-members-${i}`} style={styles.members}>
              {group.memberNames.length} {group.memberNames.length === 1 ? "member" : "members"} · {group.memberNames.join(", ")}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.md },
  groupCard: { gap: spacing.md },
  groupName: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text },
  avatars: { flexDirection: "row" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: font.weight.heavy, color: colors.accentDark },
  members: { fontSize: font.size.sm, color: colors.textMuted },
});
