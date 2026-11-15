import { Text, View } from "react-native";
import { brand, colors, font, radius, spacing } from "../constants/theme";

type Props = {
  points: number;
  kind?: "gojis" | "rewards";
  testID?: string;
  size?: "sm" | "lg";
};

export default function PointsPill({ points, kind = "gojis", testID = "points-pill", size = "sm" }: Props) {
  const golden = kind === "rewards";
  const large = size === "lg";
  return (
    <View
      testID={testID}
      accessibilityLabel={`${points} ${golden ? brand.rewards : brand.points}`}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        backgroundColor: golden ? colors.warningSoft : colors.berrySoft,
        borderRadius: radius.pill,
        paddingHorizontal: large ? spacing.lg : spacing.md,
        paddingVertical: large ? spacing.sm : spacing.xs,
      }}
    >
      <Text style={{ fontSize: large ? font.size.lg : font.size.sm }}>{golden ? brand.rewardEmoji : brand.pointsEmoji}</Text>
      <Text
        testID={`${testID}-value`}
        style={{
          fontSize: large ? font.size.lg : font.size.sm,
          fontWeight: font.weight.heavy,
          color: golden ? colors.text : colors.berryDark,
        }}
      >
        {points.toLocaleString()}
      </Text>
    </View>
  );
}
