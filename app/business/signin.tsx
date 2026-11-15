import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, type ErrorBoundaryProps } from "expo-router";
import { useQuery } from "convex/react";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Subtitle, Title } from "../../components/ui";
import { api } from "../../convex/_generated/api";
import { colors, emoji, spacing, type } from "../../constants/theme";
import { setBusinessAccount } from "../../lib/businessSession";

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="business-signin-screen">
      <Stack.Screen options={{ title: "Business sign-in" }} />
      <ErrorState testID="business-signin-error" message={error.message || "Couldn't load businesses."} onRetry={retry} />
    </Screen>
  );
}

export default function BusinessSignInScreen() {
  const router = useRouter();
  const accounts = useQuery(api.businessDashboard.listAccounts);
  const [signingIn, setSigningIn] = useState<string | null>(null);

  const signIn = async (account: { name: string; sponsorId: string | null; businessId: string | null }) => {
    setSigningIn(account.name);
    await setBusinessAccount({ name: account.name, sponsorId: account.sponsorId, businessId: account.businessId });
    router.replace("/sponsor-dashboard");
  };

  return (
    <Screen testID="business-signin-screen">
      <Stack.Screen options={{ title: "Business sign-in" }} />
      <View style={{ gap: spacing.xs }}>
        <Title testID="business-signin-title">Which business are you?</Title>
        <Subtitle>You'll only see and scan for this business. Switch accounts from your dashboard.</Subtitle>
      </View>
      {accounts === undefined ? (
        <LoadingState testID="business-signin-loading" />
      ) : accounts.length === 0 ? (
        <EmptyState testID="business-signin-empty" emoji="🏪" title="No businesses yet" body="Businesses show up here once they're seeded." />
      ) : (
        accounts.map((a, i) => (
          <Card key={a.name} testID={`business-signin-${i}`} accessibilityLabel={`Sign in as ${a.name}`} disabled={!!signingIn} onPress={() => signIn(a)} style={styles.row}>
            <Text style={styles.glyph}>🏪</Text>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={type.heading}>Sign in as {a.name}</Text>
              <Text style={type.muted}>{[a.sponsorId ? "Sponsor offers" : null, a.businessId ? "Experiences" : null].filter(Boolean).join(" · ")}</Text>
            </View>
            <Text style={styles.chevron}>{signingIn === a.name ? "…" : "›"}</Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  glyph: { fontSize: emoji.md },
  chevron: { ...type.title, color: colors.textMuted },
});
