import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { colors, font, minTapTarget, radius, shadow, spacing } from "../constants/theme";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  testID?: string;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
};

export function Screen({ children, scroll = true, edges = ["top", "bottom"], testID, contentStyle, footer }: ScreenProps) {
  return (
    <SafeAreaView testID={testID} edges={edges} style={styles.screen}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.screenContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, { flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "accent" | "muted" | "success";
  disabled?: boolean;
  accessibilityLabel?: string;
};

const cardTones = {
  default: { backgroundColor: colors.card, borderColor: colors.border },
  accent: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  muted: { backgroundColor: colors.cardMuted, borderColor: colors.cardMuted },
  success: { backgroundColor: colors.successSoft, borderColor: colors.success },
};

export function Card({ children, onPress, testID, style, tone = "default", disabled, accessibilityLabel }: CardProps) {
  const base = [styles.card, cardTones[tone], style];
  if (!onPress) {
    return (
      <View testID={testID} style={base}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {children}
    </Pressable>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  testID: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
};

const buttonVariants = {
  primary: { container: { backgroundColor: colors.accent }, text: { color: colors.textOnAccent } },
  secondary: {
    container: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accent },
    text: { color: colors.accent },
  },
  ghost: { container: { backgroundColor: "transparent" }, text: { color: colors.accent } },
  danger: { container: { backgroundColor: colors.dangerSoft }, text: { color: colors.danger } },
};

export function Button({ label, onPress, testID, variant = "primary", loading, disabled, icon, style }: ButtonProps) {
  const v = buttonVariants[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [styles.button, v.container, pressed && styles.pressed, inactive && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={v.text.color} />
      ) : (
        <Text style={[styles.buttonText, v.text]}>{icon ? `${icon}  ${label}` : label}</Text>
      )}
    </Pressable>
  );
}

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID: string;
};

export function Chip({ label, selected, onPress, testID }: ChipProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Title({ children, testID, style }: { children: ReactNode; testID?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text testID={testID} style={[styles.title, style]}>
      {children}
    </Text>
  );
}

export function Subtitle({ children, testID, style }: { children: ReactNode; testID?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text testID={testID} style={[styles.subtitle, style]}>
      {children}
    </Text>
  );
}

export function SectionHeader({ title, testID, action }: { title: string; testID?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text testID={testID} style={styles.sectionTitle}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function LoadingState({ label = "Loading…", testID = "loading-state" }: { label?: string; testID?: string }) {
  return (
    <View testID={testID} style={styles.state}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.stateBody}>{label}</Text>
    </View>
  );
}

type EmptyStateProps = {
  emoji?: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  actionTestID?: string;
};

export function EmptyState({ emoji = "🍓", title, body, actionLabel, onAction, testID = "empty-state", actionTestID = "empty-state-action" }: EmptyStateProps) {
  return (
    <Card testID={testID} tone="muted" style={styles.stateCard}>
      <Text style={styles.stateEmoji}>{emoji}</Text>
      <Text style={styles.stateTitle}>{title}</Text>
      {body ? <Text style={styles.stateBody}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Button testID={actionTestID} label={actionLabel} onPress={onAction} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />
      ) : null}
    </Card>
  );
}

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  testID?: string;
};

export function ErrorState({ message = "Something went wrong.", onRetry, testID = "error-state" }: ErrorStateProps) {
  return (
    <Card testID={testID} style={[styles.stateCard, { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }]}>
      <Text style={styles.stateEmoji}>😵</Text>
      <Text style={styles.stateTitle}>Oops</Text>
      <Text testID={`${testID}-message`} style={styles.stateBody}>
        {message}
      </Text>
      {onRetry ? (
        <Button testID={`${testID}-retry`} label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />
      ) : null}
    </Card>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  footer: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm, backgroundColor: colors.background },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    ...shadow.card,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  button: {
    minHeight: Math.max(minTapTarget, 54),
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: font.size.lg, fontWeight: font.weight.bold },
  chip: {
    minHeight: minTapTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  chipTextSelected: { color: colors.accentDark },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.text },
  subtitle: { fontSize: font.size.md, color: colors.textMuted, lineHeight: 22 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  sectionTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  state: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxxl, gap: spacing.md },
  stateCard: { alignItems: "center", paddingVertical: spacing.xxl },
  stateEmoji: { fontSize: 44, marginBottom: spacing.sm },
  stateTitle: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.text, textAlign: "center" },
  stateBody: { fontSize: font.size.md, color: colors.textMuted, textAlign: "center", marginTop: spacing.xs, lineHeight: 22 },
});
