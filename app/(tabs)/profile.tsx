import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, spacing } from "../../constants/theme";

export default function ProfileScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
        <Text testID="profile-title" style={{ fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.text }}>
          Profile
        </Text>
        <Text style={{ marginTop: spacing.sm, color: colors.textMuted }}>Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}
