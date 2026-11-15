import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { colors } from "../constants/theme";
import { useUserId } from "../lib/session";

export default function Index() {
  const { userId, loading } = useUserId();

  if (loading) {
    return (
      <View
        testID="app-loading"
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return <Redirect href={userId ? "/(tabs)/home" : "/onboarding/name"} />;
}
