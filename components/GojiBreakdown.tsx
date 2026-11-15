import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { brand, colors, font, spacing } from "../constants/theme";

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
  useEffect(() => {
    Animated.spring(totalIn, { toValue: 1, delay: 250 + data.items.length * 350, useNativeDriver: true }).start();
  }, [data.items.length, totalIn]);
  const scale = totalIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View testID="goji-breakdown" style={styles.wrap}>
      {data.items.map((item, i) => (
        <Line key={item.reason} item={item} index={i} />
      ))}
      <Animated.Text testID="upload-success-points" style={[styles.total, { opacity: totalIn, transform: [{ scale }] }]}>
        +{data.total} {brand.points}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", gap: spacing.sm },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  points: { width: 52, fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.success, textAlign: "right" },
  label: { flex: 1, fontSize: font.size.md, color: colors.text },
  total: { marginTop: spacing.sm, fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.accentDark, textAlign: "center" },
});
