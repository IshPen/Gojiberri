import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing } from "../constants/theme";

type Props = { count: number; total: number; highlight?: boolean; testID?: string };

export default function VoteBar({ count, total, highlight, testID = "vote-bar" }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const percent = total > 0 ? Math.min(100, (count / total) * 100) : 0;

  useEffect(() => {
    Animated.timing(progress, { toValue: percent, duration: 350, useNativeDriver: false }).start();
  }, [percent, progress]);

  const width = progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

  return (
    <View testID={testID} style={styles.row}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, highlight && styles.fillHighlight, { width }]} />
      </View>
      <Text testID={`${testID}-label`} style={styles.label}>
        {count} {count === 1 ? "vote" : "votes"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  track: { flex: 1, height: 12, borderRadius: radius.pill, backgroundColor: colors.cardMuted, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.warning },
  fillHighlight: { backgroundColor: colors.accent },
  label: { minWidth: 56, textAlign: "right", fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted },
});
