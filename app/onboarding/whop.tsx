import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import WhopCard from "../../components/WhopCard";
import { Button, Screen } from "../../components/ui";
import { colors, font, spacing, type } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { useUserId } from "../../lib/session";

export default function WhopStep() {
  const router = useRouter();
  const { userId } = useUserId();
  const args = userId ? { userId: userId as Id<"users"> } : "skip";
  const user = useQuery(api.users.getUser, args);
  const groups = useQuery(api.groups.getMyGroups, args);
  const crew = groups?.[0];
  const card = useQuery(api.cards.getCard, crew ? { groupId: crew._id } : "skip");
  const pot = useQuery(api.funds.getPot, crew ? { groupId: crew._id } : "skip");
  const holder = [user?.name, user?.homeArea].filter(Boolean).join(" · ") || "You";

  return (
    <Screen
      testID="onboarding-whop-screen"
      footer={<Button testID="onboarding-whop-continue" label="Continue" onPress={() => router.replace("/(tabs)/recommended")} />}
    >
      <View style={styles.hero}>
        <Text style={type.eyebrow}>Your crew card</Text>
        <Text testID="onboarding-whop-title" style={styles.title}>
          Powered by Whop
        </Text>
      </View>
      <WhopCard
        testID="onboarding-whop-card"
        crewName={card ? crew?.name ?? holder : holder}
        balance={pot?.balance ?? 0}
        goal={pot?.balance ?? 0}
        last4={card?.card.last4 ?? "••••"}
        limit={card?.limit ?? pot?.balance ?? 0}
        showNumber
      />
      <Text testID="onboarding-whop-body" style={styles.body}>
        Pool money with your crew, pay together.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs, marginTop: spacing.xl },
  title: type.title,
  body: { fontSize: font.size.md, color: colors.textMuted, textAlign: "center" },
});
