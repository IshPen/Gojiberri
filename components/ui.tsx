import { useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
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
import { brand, colors, emoji, font, minTapTarget, motion, radius, shadow, spacing, type } from "../constants/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function usePressScale(to: number = motion.pressScale) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (toValue: number) =>
    Animated.spring(scale, { toValue, speed: 40, bounciness: 0, useNativeDriver: Platform.OS !== "web" }).start();
  return { scale, onPressIn: () => spring(to), onPressOut: () => spring(1) };
}

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
  accent: { backgroundColor: colors.card, borderColor: colors.border },
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
    <PressCard testID={testID} onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel} style={base}>
      {children}
    </PressCard>
  );
}

function PressCard({ children, onPress, testID, style, disabled, accessibilityLabel }: Omit<CardProps, "tone">) {
  const press = usePressScale(0.98);
  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[style, disabled && styles.disabled, { transform: [{ scale: press.scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

type ButtonProps = {
  accessibilityLabel?: string;
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
    container: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.accent },
    text: { color: colors.accent },
  },
  ghost: { container: { backgroundColor: "transparent" }, text: { color: colors.accent } },
  danger: { container: { backgroundColor: colors.dangerSoft }, text: { color: colors.danger } },

};

export function Button({ label, accessibilityLabel, onPress, testID, variant = "primary", loading, disabled, icon, style }: ButtonProps) {
  const v = buttonVariants[variant];
  const inactive = disabled || loading;
  const press = usePressScale();
  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={[styles.button, v.container, inactive && styles.disabled, style, { transform: [{ scale: press.scale }] }]}
    >
      {loading ? (
        <ActivityIndicator color={v.text.color} />
      ) : (
        <Text style={[styles.buttonText, v.text]}>{icon ? `${icon}  ${label}` : label}</Text>
      )}
    </AnimatedPressable>
  );
}

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID: string;
};

export function Chip({ label, selected, onPress, testID }: ChipProps) {
  const press = usePressScale(0.94);
  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, selected && styles.chipSelected, { transform: [{ scale: press.scale }] }]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </AnimatedPressable>
  );
}

export function BerryMark({ emoji: glyph = brand.emoji, size = 88, testID }: { emoji?: string; size?: number; testID?: string }) {
  return (
    <View testID={testID} style={[styles.berry, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.5 }}>{glyph}</Text>
      <View style={[styles.berryLeaf, { width: size * 0.26, height: size * 0.14, top: size * 0.02, right: size * 0.12, borderRadius: size * 0.1 }]} />
    </View>
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

export function EmptyState({ emoji: glyph = brand.emoji, title, body, actionLabel, onAction, testID = "empty-state", actionTestID = "empty-state-action" }: EmptyStateProps) {
  return (
    <Card testID={testID} tone="muted" style={styles.stateCard}>
      <BerryMark emoji={glyph} size={72} />
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
      <Text style={styles.stateEmoji}>🫐</Text>
      <Text style={styles.stateTitle}>Well, that's a squished berry</Text>
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
  },
  disabled: { opacity: 0.45 },
  button: {
    minHeight: Math.max(minTapTarget, 54),
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: font.size.lg, fontWeight: font.weight.heavy, letterSpacing: 0.2 },
  chip: {
    minHeight: minTapTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.card },
  chipText: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  chipTextSelected: { color: colors.accentDark },
  title: type.title,
  subtitle: type.muted,
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  sectionTitle: type.heading,
  sectionLead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  sectionLeaf: { width: 12, height: 7, borderTopLeftRadius: 7, borderBottomRightRadius: 7, backgroundColor: colors.leaf, transform: [{ rotate: "-30deg" }] },
  berryLeaf: { position: "absolute", backgroundColor: colors.leaf, transform: [{ rotate: "-25deg" }] },
  state: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxxl, gap: spacing.md },
  stateCard: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.xs },
  stateEmoji: { fontSize: emoji.lg, marginBottom: spacing.sm },
  stateTitle: { ...type.heading, fontSize: font.size.xl, textAlign: "center", marginTop: spacing.md },
  stateBody: { ...type.muted, textAlign: "center", marginTop: spacing.xs },
  berry: { alignItems: "center", justifyContent: "center", backgroundColor: colors.berrySoft },
});
