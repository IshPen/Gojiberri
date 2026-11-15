import { StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { BerryMark, Card, Screen, Subtitle, Title } from "../components/ui";
import { brand, colors, emoji, spacing, type } from "../constants/theme";

const ROLES = [
  { id: "student", glyph: "🎓", title: "Continue as a student", body: "Plan outings with your crew, earn Gojis and claim local deals.", href: "/onboarding/school" },
  { id: "business", glyph: "🏪", title: "Continue as a business", body: "Scan student QR codes, run offers and see how crews find you.", href: "/business/signin" },
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <Screen testID="welcome-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.hero}>
        <BerryMark size={96} testID="welcome-berry" />
        <Title testID="welcome-title" style={styles.center}>
          Welcome to {brand.name}
        </Title>
        <Subtitle style={styles.center}>How are you using it today?</Subtitle>
      </View>
      {ROLES.map((r) => (
        <Card key={r.id} testID={`role-${r.id}`} tone={r.id === "student" ? "accent" : "default"} accessibilityLabel={r.title} onPress={() => router.push(r.href)} style={styles.card}>
          <Text style={styles.glyph}>{r.glyph}</Text>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={type.heading}>{r.title}</Text>
            <Text style={type.muted}>{r.body}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.md, paddingTop: spacing.xxxl, paddingBottom: spacing.xl },
  center: { textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingVertical: spacing.xxl },
  glyph: { fontSize: emoji.lg },
  chevron: { ...type.title, color: colors.textMuted },
});
