import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../constants/theme";

type Props = {
  value: number;
  onChange: (value: number) => void;
  testID?: string;
};

export default function StarRating({ value, onChange, testID = "star-rating" }: Props) {
  return (
    <View testID={testID} style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          testID={`star-${n}`}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
          accessibilityState={{ selected: n <= value }}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onChange(n);
          }}
          style={({ pressed }) => [styles.star, pressed && styles.pressed]}
        >
          <Text style={[styles.glyph, { color: n <= value ? colors.gold : colors.border }]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: spacing.xs },
  star: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: 0.9 }] },
  glyph: { fontSize: 48, lineHeight: 56 },
});
