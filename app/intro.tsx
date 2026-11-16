import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import WhopCard from "../components/WhopCard";
import { Button, Screen } from "../components/ui";
import { brand, colors, font, radius, shadow, spacing, type } from "../constants/theme";

const STORY_MS = 3600;
const useNativeDriver = Platform.OS !== "web";

const BUBBLES = [
  { text: "we should hang out!", at: 500, mine: false },
  { text: "when??", at: 750, mine: true },
  { text: "idk 😅", at: 1000, mine: false },
];
const AVATARS = [
  { glyph: "🐝", at: 2050 },
  { glyph: "🦉", at: 2200 },
  { glyph: "🐬", at: 2350 },
];
const BERRY_ANGLES = [0, 60, 120, 180, 240, 300];
const CAPTIONS = [
  { text: "Out of the group chat", from: 450, to: 1550 },
  { text: "Everyone's in", from: 1650, to: 2550 },
  { text: "Pay with Whop", from: 2650, to: Infinity },
];

export default function IntroScreen() {
  const router = useRouter();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(t, { toValue: STORY_MS, duration: STORY_MS, easing: Easing.linear, useNativeDriver }).start();
  }, [t]);

  const range = (points: number[], values: number[]) => t.interpolate({ inputRange: points, outputRange: values, extrapolate: "clamp" });
  const pop = (at: number, ms = 250) => ({
    opacity: range([at, at + ms * 0.6], [0, 1]),
    transform: [{ scale: range([at, at + ms * 0.7, at + ms], [0.5, 1.08, 1]) }],
  });

  const chatOut = { opacity: range([1500, 1750], [1, 0]), transform: [{ scale: range([1500, 1750], [1, 0.4]) }, { translateY: range([1500, 1750], [0, 30]) }] };
  const finish = () => router.replace("/welcome");

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

      <Animated.View testID="intro-card" style={{ opacity: range([0, 350], [0, 1]), transform: [{ translateY: range([0, 450], [80, 0]) }] }}>
        <WhopCard testID="intro-whop-card" crewName="Hack Crew" balance={60} goal={60} last4="4242" showNumber />
        <Animated.View testID="intro-paid" style={[styles.paid, pop(2650, 300)]}>
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
                  opacity: range([2700, 2800, 3300], [0, 1, 0]),
                  transform: [
                    { translateX: range([2700, 3300], [0, Math.cos(rad) * 110]) },
                    { translateY: range([2700, 3300], [0, Math.sin(rad) * 70]) },
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
        <Animated.View testID="intro-outing" style={[styles.outing, pop(1700, 300)]}>
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
