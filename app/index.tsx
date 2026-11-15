import { Redirect } from "expo-router";
import { useConvex } from "convex/react";
import type { GenericId as Id } from "convex/values";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ErrorState, Screen } from "../components/ui";
import { colors } from "../constants/theme";
import { api } from "../convex/_generated/api";
import { clearUserId, useUserId } from "../lib/session";
import { TimeoutError, withTimeout } from "../lib/timeout";

type Check = { userId: string; valid: boolean } | { userId: string; error: string };

export default function Index() {
  const convex = useConvex();
  const { userId, loading } = useUserId();
  const [check, setCheck] = useState<Check | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    withTimeout(convex.query(api.users.getUser, { userId: userId as Id<"users"> }), "We couldn't reach Gojiberri. Check your connection and try again.")
      .then((user) => user !== null, (e) => (e instanceof TimeoutError ? e : false))
      .then(async (result) => {
        if (result instanceof TimeoutError) {
          if (!cancelled) setCheck({ userId, error: result.message });
          return;
        }
        if (!result) await clearUserId();
        if (!cancelled) setCheck({ userId, valid: result });
      });
    return () => {
      cancelled = true;
    };
  }, [convex, userId, attempt]);

  if (userId && check?.userId === userId && "error" in check) {
    return (
      <Screen testID="app-offline">
        <ErrorState
          testID="app-offline-error"
          message={check.error}
          onRetry={() => {
            setCheck(null);
            setAttempt((a) => a + 1);
          }}
        />
      </Screen>
    );
  }

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

  return <Redirect href={userId && check && "valid" in check && check.valid ? "/(tabs)/recommended" : "/onboarding/school"} />;
}
