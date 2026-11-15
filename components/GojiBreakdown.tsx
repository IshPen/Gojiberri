import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { brand, colors, font, motion, spacing, type } from "../constants/theme";

export type GojiItem = { reason: string; points: number; label: string };
export type GojiBreakdownData = { total: number; items: GojiItem[] };

function Line({ item, index }: { item: GojiItem; index: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 300, delay: 250 + index * 350, useNativeDriver: true }).start();
  }, [index, progress]);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });
  return (
    <Animated.View testID={`goji-item-${item.reason}`} style={[styles.line, { opacity: progress, transform: [{ translateX }] }]}>
      <Text style={styles.points}>+{item.points}</Text>
      <Text style={styles.label}>{item.label}</Text>
    </Animated.View>
  );
}

export default function GojiBreakdown({ data }: { data: GojiBreakdownData }) {
  const totalIn = useRef(new Animated.Value(0)).current;
  const count = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const delay = 250 + data.items.length * 350;
    const id = count.addListener(({ value }) => setShown(Math.round(value)));
    Animated.parallel([
      Animated.spring(totalIn, { toValue: 1, delay, bounciness: 12, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(count, { toValue: data.total, delay, duration: motion.countUp, useNativeDriver: false }),
    ]).start();
    return () => count.removeListener(id);
  }, [data.items.length, data.total, totalIn, count]);
  const scale = totalIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View testID="goji-breakdown" style={styles.wrap}>
      {data.items.map((item, i) => (
        <Line key={item.reason} item={item} index={i} />
      ))}
      <Animated.Text testID="upload-success-points" style={[styles.total, { opacity: totalIn, transform: [{ scale }] }]}>
        {brand.pointsEmoji} +{shown} {brand.points}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", gap: spacing.sm },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  points: { width: 52, fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.leaf, textAlign: "right", fontVariant: ["tabular-nums"] },
  label: { ...type.body, flex: 1 },
  total: { ...type.display, marginTop: spacing.sm, color: colors.accentDark, textAlign: "center", fontVariant: ["tabular-nums"] },
});
