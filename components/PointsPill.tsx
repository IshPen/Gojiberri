import { Text, View } from "react-native";
import { brand, colors, font, radius, spacing } from "../constants/theme";

type Props = {
  points: number;
  kind?: "gojis" | "golden";
  testID?: string;
  size?: "sm" | "lg";
};

export default function PointsPill({ points, kind = "gojis", testID = "points-pill", size = "sm" }: Props) {
  const golden = kind === "golden";
  const large = size === "lg";
  return (
    <View
      testID={testID}
      accessibilityLabel={`${points} ${golden ? brand.diamonds : brand.points}`}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        backgroundColor: golden ? colors.warningSoft : colors.accentSoft,
        borderRadius: radius.pill,
        paddingHorizontal: large ? spacing.lg : spacing.md,
        paddingVertical: large ? spacing.sm : spacing.xs,
      }}
    >
      <Text style={{ fontSize: large ? font.size.lg : font.size.sm }}>{golden ? brand.diamondsEmoji : brand.pointsEmoji}</Text>
      <Text
        testID={`${testID}-value`}
        style={{
          fontSize: large ? font.size.lg : font.size.sm,
          fontWeight: font.weight.heavy,
          color: golden ? colors.text : colors.accentDark,
        }}
      >
        {points.toLocaleString()}
      </Text>
    </View>
  );
}
