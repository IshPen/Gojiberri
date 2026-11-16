import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import WhopCard from "../components/WhopCard";
import { Button, Screen } from "../components/ui";
import { brand, colors, font, radius, shadow, spacing, type } from "../constants/theme";

const STORY_MS = 4000;
const useNativeDriver = Platform.OS !== "web";

const BUBBLES = [
  { text: "we should hang out!", at: 500, mine: false },
  { text: "when??", at: 800, mine: true },
  { text: "idk 😅", at: 1100, mine: false },
];
const AVATARS = [
  { glyph: "🐝", at: 2250 },
  { glyph: "🦉", at: 2450 },
  { glyph: "🐬", at: 2650 },
];
const BERRY_ANGLES = [0, 60, 120, 180, 240, 300];
const CAPTIONS = [
  { text: "Out of the group chat", from: 450, to: 1700 },
  { text: "Everyone's in", from: 1800, to: 2950 },
  { text: "Pay with Whop", from: 3050, to: Infinity },
];

export default function IntroScreen() {
  const router = useRouter();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    t.setValue(0);
    const story = Animated.timing(t, { toValue: STORY_MS, duration: STORY_MS, delay: 250, easing: Easing.linear, useNativeDriver });
    story.start();
    return () => story.stop();
  }, [t]);

  const range = (points: number[], values: number[]) => t.interpolate({ inputRange: points, outputRange: values, extrapolate: "clamp" });
  const pop = (at: number, ms = 250) => ({
    opacity: range([at, at + ms * 0.6], [0, 1]),
    transform: [{ scale: range([at, at + ms * 0.7, at + ms], [0.3, 1.15, 1]) }],
  });

  const chatOut = { opacity: range([1650, 1900], [1, 0]), transform: [{ scale: range([1650, 1900], [1, 0.3]) }, { translateY: range([1650, 1900], [0, 40]) }] };
  const finish = () => (replay && router.canGoBack() ? router.back() : router.replace("/welcome"));

  return (
    <Screen testID="intro-screen" scroll={false} footer={<Button testID="intro-get-started" label={replay ? "Done" : "Get started"} onPress={finish} />}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <Text testID="intro-wordmark" style={styles.wordmark}>
          {brand.name}
        </Text>
        <Text testID="intro-skip" style={styles.skip} onPress={finish} accessibilityRole="button">
          Skip
        </Text>
      </View>

      <Animated.View testID="intro-card" style={{ opacity: range([0, 350], [0, 1]), transform: [{ translateY: range([0, 500], [180, 0]) }, { scale: range([0, 500], [0.85, 1]) }] }}>
        <WhopCard testID="intro-whop-card" crewName="Hack Crew" balance={60} goal={60} last4="4242" showNumber />
        <Animated.View testID="intro-paid" style={[styles.paid, pop(3050, 350)]}>
          <Text style={styles.paidText}>Paid ✓</Text>
        </Animated.View>
        {BERRY_ANGLES.map((angle) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <Animated.Text
              key={angle}
              style={[
                styles.berry,
                {
                  opacity: range([3100, 3200, 3800], [0, 1, 0]),
                  transform: [
                    { translateX: range([3100, 3800], [0, Math.cos(rad) * 130]) },
                    { translateY: range([3100, 3800], [0, Math.sin(rad) * 90]) },
                  ],
                },
              ]}
            >
              🍓
            </Animated.Text>
          );
        })}
      </Animated.View>

      <View style={styles.stage}>
        <Animated.View style={[styles.chat, chatOut]}>
          {BUBBLES.map((b, i) => (
            <Animated.View key={b.text} testID={`intro-bubble-${i}`} style={[styles.bubble, b.mine ? styles.mine : styles.theirs, pop(b.at)]}>
              <Text style={[styles.bubbleText, b.mine && { color: colors.textOnAccent }]}>{b.text}</Text>
            </Animated.View>
          ))}
        </Animated.View>
        <Animated.View testID="intro-outing" style={[styles.outing, pop(1850, 350)]}>
          <Text style={styles.outingTitle}>🧋 Boba crawl · Sat</Text>
          <View style={styles.avatars}>
            {AVATARS.map((a, i) => (
              <View key={a.glyph} style={styles.avatar}>
                <Text style={styles.avatarGlyph}>{a.glyph}</Text>
                <Animated.View testID={`intro-check-${i}`} style={[styles.check, pop(a.at, 200)]}>
                  <Text style={styles.checkText}>✓</Text>
                </Animated.View>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>

      <View style={styles.captions}>
        {CAPTIONS.map((c, i) => (
          <Animated.Text
            key={c.text}
            testID={`intro-caption-${i}`}
            style={[styles.caption, { opacity: c.to === Infinity ? range([c.from, c.from + 200], [0, 1]) : range([c.from, c.from + 200, c.to - 150, c.to], [0, 1, 1, 0]) }]}
          >
            {c.text}
          </Animated.Text>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingTop: spacing.lg },
  wordmark: { ...type.title, color: colors.berry },
  skip: { position: "absolute", right: 0, top: spacing.lg, padding: spacing.sm, ...type.label },
  paid: {
    position: "absolute",
    top: -spacing.md,
    right: spacing.md,
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadow.sm,
  },
  paidText: { color: colors.textOnAccent, fontSize: font.size.md, fontWeight: font.weight.heavy },
  berry: { position: "absolute", left: "50%", top: "45%", fontSize: font.size.xl },
  stage: { flex: 1, justifyContent: "center" },
  chat: { gap: spacing.sm },
  bubble: { maxWidth: "75%", borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  mine: { alignSelf: "flex-end", backgroundColor: colors.accent },
  bubbleText: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  outing: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadow.card,
  },
  outingTitle: { ...type.heading, fontSize: font.size.xl },
  avatars: { flexDirection: "row", gap: spacing.lg },
  avatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  avatarGlyph: { fontSize: font.size.xxl },
  check: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: { color: colors.textOnAccent, fontSize: font.size.xs, fontWeight: font.weight.heavy },
  captions: { height: 36, alignItems: "center", justifyContent: "center" },
  caption: { ...type.heading, fontSize: font.size.xl, position: "absolute" },
});
