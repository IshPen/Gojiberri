import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button, Screen } from "../components/ui";
import { brand, colors, emoji, font, radius, spacing, type } from "../constants/theme";

export const INTRO_SEEN_KEY = "gojiberri.introSeen";

const BEATS = [
  { glyph: "💬", text: "Out of the group chat", tint: colors.accentSoft },
  { glyph: "🍓", text: "Find what everyone loves", tint: colors.berrySoft },
  { glyph: "💳", text: "Pay together with Whop", tint: colors.accentSoft },
];
const BEAT_MS = 600;
const useNativeDriver = Platform.OS !== "web";

export default function IntroScreen() {
  const router = useRouter();
  const progress = useRef(BEATS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      BEAT_MS,
      progress.map((value) => Animated.timing(value, { toValue: 1, duration: BEAT_MS - 150, useNativeDriver })),
    ).start();
  }, [progress]);

  const finish = async () => {
    await AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => {});
    router.replace("/welcome");
  };

  return (
    <Screen testID="intro-screen" scroll={false} footer={<Button testID="intro-get-started" label="Get started" onPress={finish} />}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <Text testID="intro-wordmark" style={styles.wordmark}>
          {brand.name}
        </Text>
        <Text testID="intro-skip" style={styles.skip} onPress={finish} accessibilityRole="button">
          Skip
        </Text>
      </View>
      <View style={styles.beats}>
        {BEATS.map((beat, i) => (
          <Animated.View
            key={beat.text}
            testID={`intro-beat-${i}`}
            style={[
              styles.beat,
              { opacity: progress[i], transform: [{ translateY: progress[i].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
            ]}
          >
            <View style={[styles.circle, { backgroundColor: beat.tint }]}>
              <Text style={styles.glyph}>{beat.glyph}</Text>
            </View>
            <Text style={styles.text}>{beat.text}</Text>
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingTop: spacing.xl },
  wordmark: { ...type.display, color: colors.berry },
  skip: { position: "absolute", right: 0, top: spacing.xl, padding: spacing.sm, ...type.label },
  beats: { flex: 1, justifyContent: "center", gap: spacing.xl },
  beat: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  circle: { width: 72, height: 72, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  glyph: { fontSize: emoji.lg },
  text: { ...type.heading, fontSize: font.size.xl, flex: 1 },
});
