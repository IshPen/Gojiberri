import { useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

export type SwipeSide = "left" | "right";
export type SwipeOption = { label: string; emoji: string };

type SwipeCardProps = {
  left: SwipeOption;
  right: SwipeOption;
  onPick: (side: SwipeSide) => void;
};

const SWIPE_THRESHOLD = 90;

export default function SwipeCard({ left, right, onPick }: SwipeCardProps) {
  const x = useRef(new Animated.Value(0)).current;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const fling = (side: SwipeSide) => {
    Animated.timing(x, { toValue: side === "left" ? -500 : 500, duration: 180, useNativeDriver: true }).start(() =>
      pickRef.current(side),
    );
  };
  const flingRef = useRef(fling);
  flingRef.current = fling;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx: x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE_THRESHOLD) flingRef.current("left");
        else if (g.dx >= SWIPE_THRESHOLD) flingRef.current("right");
        else Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
    }),
  ).current;

  const rotate = x.interpolate({ inputRange: [-250, 0, 250], outputRange: ["-8deg", "0deg", "8deg"] });
  const leftGlow = x.interpolate({ inputRange: [-120, 0], outputRange: [1, 0], extrapolate: "clamp" });
  const rightGlow = x.interpolate({ inputRange: [0, 120], outputRange: [0, 1], extrapolate: "clamp" });

  return (
    <Animated.View
      testID="swipe-card"
      style={[styles.card, { transform: [{ translateX: x }, { rotate }] }]}
      {...pan.panHandlers}
    >
      <Half testID="swipe-option-left" option={left} glow={leftGlow} onPress={() => fling("left")} />
      <View style={styles.divider}>
        <Text style={styles.or}>or</Text>
      </View>
      <Half testID="swipe-option-right" option={right} glow={rightGlow} onPress={() => fling("right")} />
    </Animated.View>
  );
}

function Half({
  option,
  glow,
  onPress,
  testID,
}: {
  option: SwipeOption;
  glow: Animated.AnimatedInterpolation<number>;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={option.label}
      style={({ pressed }) => [styles.half, pressed && styles.pressed]}
    >
      <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glow }]} />
      <Text testID={testID + "-emoji"} style={styles.emoji}>
        {option.emoji}
      </Text>
      <Text testID={testID + "-label"} style={styles.label}>
        {option.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.card,
  },
  half: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  pressed: { backgroundColor: colors.cardMuted },
  glow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.accentSoft },
  emoji: { fontSize: 84 },
  label: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.text, textAlign: "center" },
  divider: { height: 1, backgroundColor: colors.border, alignItems: "center", justifyContent: "center" },
  or: {
    position: "absolute",
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    color: colors.textMuted,
    fontWeight: font.weight.bold,
    fontSize: font.size.sm,
  },
});
