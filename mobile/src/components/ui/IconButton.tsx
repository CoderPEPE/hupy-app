import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, ICON_BUTTON_SIZE, radius } from '../../theme';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** `plain` on light screens, `onPrimary` on the purple headers. */
  variant?: 'surface' | 'plain' | 'onPrimary';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

/**
 * Circular icon button — the single source of truth for the back/settings/
 * overflow buttons that sit in screen headers. Previously each screen
 * declared its own 40x40 round button under a different name
 * (iconBtn / backBtn / headerIconBtn / studyIconBtn / historyBack / roundBtn),
 * which let their sizes and backgrounds drift apart.
 */
export function IconButton({
  children,
  onPress,
  accessibilityLabel,
  variant = 'surface',
  style,
  disabled,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.base, variant === 'surface' && styles.surface, disabled && styles.disabled, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surface: {
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: 0.4,
  },
});
