import { Redirect } from "expo-router";
import { useConvex } from "convex/react";
import type { GenericId as Id } from "convex/values";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { colors } from "../constants/theme";
import { api } from "../convex/_generated/api";
import { clearUserId, useUserId } from "../lib/session";

type Check = { userId: string; valid: boolean };

export default function Index() {
  const convex = useConvex();
  const { userId, loading } = useUserId();
  const [check, setCheck] = useState<Check | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    convex
      .query(api.users.getUser, { userId: userId as Id<"users"> })
      .then((user) => user !== null, () => false)
      .then(async (valid) => {
        if (!valid) await clearUserId();
        if (!cancelled) setCheck({ userId, valid });
      });
    return () => {
      cancelled = true;
    };
  }, [convex, userId]);

  if (loading || (userId && check?.userId !== userId)) {
    return (
      <View
        testID="app-loading"
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return <Redirect href={userId && check?.valid ? "/(tabs)/recommended" : "/onboarding/school"} />;
}
