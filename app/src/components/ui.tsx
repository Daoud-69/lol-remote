import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { radius, spacing, theme } from "../theme";

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

type ButtonVariant = "primary" | "danger" | "ghost" | "gold";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  size = "md",
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  size?: "md" | "lg";
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        size === "lg" && styles.buttonLg,
        variantStyles[variant],
        pressed && !inactive && styles.buttonPressed,
        inactive && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.bg} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            size === "lg" && styles.buttonLabelLg,
            variant === "ghost" && styles.buttonLabelGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: theme.blue },
  gold: { backgroundColor: theme.gold },
  danger: { backgroundColor: theme.red },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.border,
  },
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: theme.gold,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  muted: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLg: { paddingVertical: spacing.xl },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.35 },
  buttonLabel: {
    color: theme.bg,
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  buttonLabelLg: { fontSize: 20, letterSpacing: 1 },
  buttonLabelGhost: { color: theme.textMuted },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
