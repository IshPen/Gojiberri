import { Text, View } from "react-native";
import { colors, font, radius, spacing } from "../constants/theme";

export default function SponsoredBadge({ testID = "sponsored-badge" }: { testID?: string }) {
  return (
    <View
      testID={testID}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.warningSoft,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.text, letterSpacing: 0.5 }}>
        ⭐ SPONSORED
      </Text>
    </View>
  );
}
