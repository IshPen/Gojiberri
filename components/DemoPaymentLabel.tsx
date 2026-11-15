import { StyleSheet, Text } from "react-native";
import { colors, font, radius, spacing } from "../constants/theme";

export default function DemoPaymentLabel({ testID }: { testID?: string }) {
  return (
    <Text testID={testID} style={styles.label}>
      Demo payment
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    alignSelf: "center",
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    color: colors.textMuted,
    backgroundColor: colors.cardMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
});
