import { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, StyleSheet, Text } from "react-native";

const BERRIES = ["🍓", "🫐", "🍒", "🍓", "🍓"];

export default function BerryBurst({ count = 28, testID }: { count?: number; testID?: string }) {
  const { width, height } = Dimensions.get("window");
  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        delay: Math.random() * 600,
        duration: 1800 + Math.random() * 1200,
        spin: (Math.random() - 0.5) * 720,
        size: 18 + Math.random() * 14,
        berry: BERRIES[i % BERRIES.length],
        value: new Animated.Value(0),
      })),
    [count, width],
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    Animated.parallel(drops.map((d) => Animated.timing(d.value, { toValue: 1, duration: d.duration, delay: d.delay, useNativeDriver: true }))).start();
  }, [drops]);

  return (
    <Animated.View testID={testID} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {drops.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: d.x,
            top: -40,
            opacity: d.value.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: d.value.interpolate({ inputRange: [0, 1], outputRange: [0, height + 80] }) },
              { rotate: d.value.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${d.spin}deg`] }) },
            ],
          }}
        >
          <Text style={{ fontSize: d.size }}>{d.berry}</Text>
        </Animated.View>
      ))}
    </Animated.View>
  );
}
