import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, font, radius, TAP } from '../theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

const VARIANTS: Record<Variant, { bg: string; border: string; text: string }> = {
  primary: { bg: colors.amber, border: colors.amber, text: colors.navy },
  secondary: { bg: colors.navy, border: colors.navy, text: colors.white },
  outline: { bg: 'transparent', border: colors.white, text: colors.white },
  ghost: { bg: 'transparent', border: 'transparent', text: colors.navy },
  danger: { bg: colors.red, border: colors.red, text: colors.white },
};

// One button style for the whole app (44px+ tap target).
export default function Button({ title, onPress, variant = 'primary', disabled, loading, small, style }: Props) {
  const v = VARIANTS[variant];
  const isDisabled = !!disabled || !!loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: v.bg, borderColor: v.border },
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <Text style={[styles.text, small && styles.smallText, { color: v.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TAP + 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  small: { minHeight: TAP, paddingHorizontal: 14, borderRadius: radius.sm },
  text: { fontSize: font.body + 1, fontWeight: '700', letterSpacing: 0.2 },
  smallText: { fontSize: font.small },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
