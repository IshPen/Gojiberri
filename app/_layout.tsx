import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors, type } from "../constants/theme";

const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL ?? "https://flippant-marten-689.convex.cloud",
  { unsavedChangesWarning: false },
);

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTintColor: colors.accent,
            headerTitleStyle: { ...type.heading, color: colors.textMuted },
            headerTitleAlign: "center",
            headerBackButtonDisplayMode: "minimal",
            animation: "slide_from_right",
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </ConvexProvider>
  );
}
