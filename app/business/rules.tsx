import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, Stack, useRouter } from "expo-router";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import { colors, font, radius, spacing, type } from "../../constants/theme";
import { formatDay } from "../../lib/format";
import { useBusinessAccount } from "../../lib/businessSession";
import { sameBusiness, saveRule, useBusinessMock, type MockRule } from "../../lib/businessMock";

const money = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`;

export default function SponsorshipRulesScreen() {
  const { account, loading } = useBusinessAccount();
  const business = account?.name ?? null;
  const rules = useBusinessMock((s) => s.rules);
  if (loading) {
    return (
      <Screen testID="rules-screen">
        <Stack.Screen options={{ title: "Sponsorship rules" }} />
        <LoadingState testID="rules-loading" />
      </Screen>
    );
  }
  if (!business) return <Redirect href="/business/signin" />;
  const rule = Object.values(rules).find((r) => sameBusiness(r.businessName, business)) ?? null;
  return <RuleForm business={business} rule={rule} />;
}

function RuleForm({ business, rule }: { business: string; rule: MockRule | null }) {
  const router = useRouter();
  const [amount, setAmount] = useState(rule ? String(rule.amount) : "10");
  const [budget, setBudget] = useState(rule ? String(rule.monthlyBudget) : "100");
  const [active, setActive] = useState(rule?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    setError(null);
    try {
      saveRule(business, { amount: Math.round(Number(amount) * 100) / 100, monthlyBudget: Number(budget), active });
      if (router.canGoBack()) router.back();
      else router.replace("/sponsor-dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the rule.");
    }
  };

  const spent = rule?.spentThisMonth ?? 0;
  const cap = rule?.monthlyBudget ?? (Number(budget) || 0);

  return (
    <Screen testID="rules-screen">
      <Stack.Screen options={{ title: "Sponsorship rules" }} />
      <View style={{ gap: spacing.xs }}>
        <Text style={type.eyebrow}>{business}</Text>
        <Title testID="rules-title">Auto-sponsorship</Title>
        <Subtitle>When a crew locks a plan at your place, we chip into their pot for you, split evenly across everyone who confirmed.</Subtitle>
      </View>

      <Card testID="rules-editor" style={{ gap: spacing.lg }}>
        <View style={styles.sentence}>
          <Text style={styles.sentenceText}>Chip $</Text>
          <TextInput testID="rules-amount-input" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.inline} />
          <Text style={styles.sentenceText}>into a crew's pot when they pick us</Text>
        </View>
        <View style={styles.sentence}>
          <Text style={styles.sentenceText}>Up to $</Text>
          <TextInput testID="rules-budget-input" value={budget} onChangeText={setBudget} keyboardType="number-pad" style={styles.inline} />
          <Text style={styles.sentenceText}>a month</Text>
        </View>
        <View style={styles.chips}>
          <Chip testID="rules-status-on" label="On" selected={active} onPress={() => setActive(true)} />
          <Chip testID="rules-status-off" label="Paused" selected={!active} onPress={() => setActive(false)} />
        </View>
      </Card>

      {error ? <ErrorState testID="rules-error" message={error} /> : null}
      <Button testID="rules-save" label="Save rule" onPress={onSave} />

      <SectionHeader title="This month" testID="rules-month-header" />
      <Card testID="rules-budget-card" tone="muted" style={{ gap: spacing.sm }}>
        <Text testID="rules-spent" style={type.heading}>
          {money(spent)} of {money(cap)} spent
        </Text>
        <View style={styles.meter}>
          <View style={[styles.meterFill, { width: `${cap ? Math.min(100, (spent / cap) * 100) : 0}%` }]} />
        </View>
        <Text style={type.muted}>Chip-ins stop automatically when the budget runs out.</Text>
      </Card>
      {!rule || rule.chipIns.length === 0 ? (
        <EmptyState testID="rules-chipins-empty" emoji="🫙" title="No chip-ins yet" body="They show up here when crews lock a plan with you." />
      ) : (
        rule.chipIns.map((c, i) => (
          <Card key={`${c.crew}-${c.at}`} testID={`rules-chipin-${i}`} style={styles.row}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.rowTitle}>{c.crew}</Text>
              <Text style={type.muted}>
                {formatDay(c.at)} · {money(Math.floor((c.amount * 100) / c.attendees) / 100)} each for {c.attendees}
              </Text>
            </View>
            <Text style={styles.amount}>{money(c.amount)}</Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sentence: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  sentenceText: { ...type.heading, color: colors.text },
  inline: {
    minWidth: 72,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy,
    color: colors.accentDark,
    backgroundColor: colors.accentSoft,
    textAlign: "center",
  },
  chips: { flexDirection: "row", gap: spacing.sm },
  meter: { height: 12, borderRadius: radius.pill, backgroundColor: colors.card, overflow: "hidden" },
  meterFill: { height: 12, borderRadius: radius.pill, backgroundColor: colors.accent },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  rowTitle: { ...type.body, fontWeight: font.weight.bold },
  amount: { ...type.heading, color: colors.success },
});
