import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { spacing, surfaces } from '../../theme';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  /** `flat` drops the elevation/border for quiet grouping panels. */
  variant?: 'card' | 'flat';
  /** Lay children out in a row (the common icon + text + chevron pattern). */
  row?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

/**
 * Standard content surface. The same
 * `card + radius.lg + 1px border + shadows.card` recipe was repeated in ~16
 * places; centralizing it keeps every card visually identical and makes a
 * global tweak a one-line change.
 */
export function Card({ children, onPress, variant = 'card', row, style, disabled }: Props) {
  const composed = [styles.base, surfaces[variant], row && styles.row, style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [composed, disabled && styles.disabled, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={composed}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.6,
  },
  /** Subtle tactile feedback for every tappable card — a 1.5% shrink reads as
   * "pressed" without fighting the screen's scroll. */
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
