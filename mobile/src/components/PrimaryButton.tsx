import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

/**
 * Bold button with a chunky 3D base layer and springy press feedback.
 * The base layer (not a border) gives the depth so it renders cleanly with
 * the rounded corners — no hard lines.
 */
export function PrimaryButton({ title, onPress, loading, disabled, variant = 'primary' }: Props) {
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary';

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const baseStyle = useAnimatedStyle(() => ({
    // Base collapses as the button is pressed, creating the "squish" effect.
    transform: [{ translateY: pressed.value * 3 }],
  }));

  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -pressed.value * 3 }],
  }));

  return (
    <Animated.View style={[styles.wrap, scaleStyle]}>
      {isPrimary && <Animated.View style={[styles.base, baseStyle]} />}
      <Animated.View style={[styles.lift, isPrimary && liftStyle]}>
        <Pressable
          onPressIn={() => {
            if (isDisabled) return;
            scale.value = withSpring(0.98, { damping: 15, stiffness: 320 });
            if (isPrimary) pressed.value = withTiming(1, { duration: 90 });
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 12, stiffness: 260 });
            if (isPrimary) pressed.value = withTiming(0, { duration: 150 });
          }}
          onPress={onPress}
          disabled={isDisabled}
          style={[
            styles.button,
            isPrimary ? styles.primary : styles.secondary,
            isDisabled && styles.disabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={isPrimary ? colors.textOnPrimary : colors.primary} />
          ) : (
            <Text style={[styles.text, isPrimary ? styles.primaryText : styles.secondaryText]}>
              {title}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  base: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 5,
    bottom: 0,
    borderRadius: 8,
    backgroundColor: colors.primaryPressed,
  },
  lift: {
    position: 'relative',
  },
  button: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  primaryText: {
    color: colors.textOnPrimary,
  },
  secondaryText: {
    color: colors.primary,
  },
});
