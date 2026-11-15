import { StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

const BERRY_SLOTS = 12;
const WEAVE_ROWS = 3;
const WEAVE_COLS = 6;

export default function Basket({ progress, size = 96, testID }: { progress: number; size?: number; testID?: string }) {
  const filled = Math.round(Math.min(Math.max(progress, 0), 1) * BERRY_SLOTS);
  const berry = size * 0.17;
  const bodyHeight = size * 0.42;
  return (
    <View testID={testID} accessibilityLabel={`Basket ${Math.round(progress * 100)} percent full`} style={{ width: size, height: size * 0.95 }}>
      <View style={[styles.handle, { width: size * 0.7, height: size * 0.6, left: size * 0.15, borderRadius: size * 0.35, borderWidth: size * 0.05 }]} />
      <View style={[styles.berries, { left: size * 0.1, right: size * 0.1, bottom: bodyHeight - berry * 0.3 }]}>
        {Array.from({ length: BERRY_SLOTS }, (_, i) => (
          <View
            key={i}
            testID={testID ? `${testID}-berry-${i}` : undefined}
            style={[
              styles.berry,
              { width: berry, height: berry * 1.15, borderRadius: berry / 2, opacity: i < filled ? 1 : 0, marginLeft: i % 6 === 0 ? 0 : -berry * 0.12 },
            ]}
          >
            <View style={[styles.leaf, { width: berry * 0.4, height: berry * 0.22, top: -berry * 0.1, left: berry * 0.3 }]} />
          </View>
        ))}
      </View>
      <View style={[styles.body, { height: bodyHeight, borderBottomLeftRadius: size * 0.16, borderBottomRightRadius: size * 0.16 }]}>
        {Array.from({ length: WEAVE_ROWS }, (_, r) => (
          <View key={r} style={styles.weaveRow}>
            {Array.from({ length: WEAVE_COLS }, (_, c) => (
              <View key={c} style={[styles.weave, (r + c) % 2 === 0 ? styles.weaveLight : styles.weaveDark]} />
            ))}
          </View>
        ))}
      </View>
      <View style={[styles.rim, { bottom: bodyHeight - size * 0.04, height: size * 0.08, borderRadius: size * 0.04 }]} />
      {filled === 0 ? <Text style={[styles.empty, { bottom: bodyHeight + size * 0.02, fontSize: size * 0.12 }]}>·  ·  ·</Text> : null}
    </View>
  );
}

const WICKER = "#C98B4B";
const WICKER_DARK = "#9A6233";
const WICKER_LIGHT = "#E0AE72";

const styles = StyleSheet.create({
  handle: { position: "absolute", top: 0, borderColor: WICKER_DARK, borderBottomColor: "transparent", borderLeftColor: WICKER_DARK, borderRightColor: WICKER_DARK },
  berries: { position: "absolute", flexDirection: "row", flexWrap: "wrap-reverse", justifyContent: "center" },
  berry: { backgroundColor: colors.berry, borderWidth: 1, borderColor: colors.berryDark, marginTop: -2 },
  leaf: { position: "absolute", backgroundColor: colors.leaf, borderRadius: 4 },
  body: { position: "absolute", left: "6%", right: "6%", bottom: 0, backgroundColor: WICKER, overflow: "hidden", paddingTop: 4, gap: 2 },
  weaveRow: { flex: 1, flexDirection: "row", gap: 2, paddingHorizontal: 2 },
  weave: { flex: 1, borderRadius: 3 },
  weaveLight: { backgroundColor: WICKER_LIGHT },
  weaveDark: { backgroundColor: WICKER_DARK },
  rim: { position: "absolute", left: 0, right: 0, backgroundColor: WICKER_DARK },
  empty: { position: "absolute", left: 0, right: 0, textAlign: "center", color: WICKER_LIGHT },
});
