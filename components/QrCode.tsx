import { useMemo } from "react";
import { View } from "react-native";
import { encodeQr } from "../lib/qr";

type Props = { value: string; size: number; testID?: string; color?: string; background?: string };

const QUIET_ZONE = 4;

export default function QrCode({ value, size, testID, color = "#000000", background = "#FFFFFF" }: Props) {
  const matrix = useMemo(() => encodeQr(value), [value]);
  const cells = matrix.length + QUIET_ZONE * 2;
  const cell = Math.floor(size / cells);
  const rows = useMemo(
    () =>
      matrix.map((row) => {
        const runs: { start: number; length: number }[] = [];
        row.forEach((dark, x) => {
          if (!dark) return;
          const last = runs[runs.length - 1];
          if (last && last.start + last.length === x) last.length++;
          else runs.push({ start: x, length: 1 });
        });
        return runs;
      }),
    [matrix],
  );

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel="QR code"
      style={{ width: cell * cells, height: cell * cells, padding: cell * QUIET_ZONE, backgroundColor: background }}
    >
      {rows.map((runs, y) => (
        <View key={y} style={{ height: cell, flexDirection: "row" }}>
          {runs.map((run) => (
            <View key={run.start} style={{ position: "absolute", left: run.start * cell, width: run.length * cell, height: cell, backgroundColor: color }} />
          ))}
        </View>
      ))}
    </View>
  );
}
