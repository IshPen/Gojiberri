import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { colors, spacing } from "../constants/theme";

type Props = {
  value: number;
  onChange: (value: number) => void;
  testID?: string;
};

function Star({ n, filled, onPress }: { n: number; filled: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!filled) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.25, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [filled, scale]);

  return (
    <Pressable
      testID={"star-" + n}
      accessibilityRole="button"
      accessibilityLabel={n + " star" + (n === 1 ? "" : "s")}
      accessibilityState={{ selected: filled }}
      onPress={onPress}
      style={({ pressed }) => [styles.star, pressed && styles.pressed]}
    >
      <Animated.Text style={[styles.glyph, { color: filled ? colors.gold : colors.border, transform: [{ scale }] }]}>★</Animated.Text>
    </Pressable>
  );
}

export default function StarRating({ value, onChange, testID = "star-rating" }: Props) {
  return (
    <View testID={testID} style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          n={n}
          filled={n <= value}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onChange(n);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: spacing.xs },
  star: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.8 },
  glyph: { fontSize: 48, lineHeight: 56 },
});
