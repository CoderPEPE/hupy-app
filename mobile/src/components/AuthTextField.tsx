import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useT } from '../i18n';
import { colors, radius, spacing } from '../theme';

type Props = TextInputProps & {
  /** Omit for an icon-led field that carries its name in the placeholder. */
  label?: string;
  error?: string;
  /** Adds a show/hide toggle for secure fields. */
  secure?: boolean;
  /** Leading glyph inside the field. */
  icon?: React.ReactNode;
};

/**
 * Auth text field with a focus ring, error shake and a show/hide toggle for
 * passwords. Styled to sit on the floating auth card.
 */
export function AuthTextField({ label, error, secure, icon, ...inputProps }: Props) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure ?? false);
  const shake = useRef(new Animated.Value(0)).current;
  const errorOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error) return;
    errorOpacity.setValue(1);
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: -10, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(shake, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -6, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    Animated.timing(errorOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [error, shake, errorOpacity]);

  const showError = error != null;

  return (
    <View style={styles.wrapper}>
      {label != null && (
        <Text style={[styles.label, focused && styles.labelFocused, showError && styles.labelError]}>
          {label}
        </Text>
      )}
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <View
          style={[
            styles.inputShell,
            focused && styles.inputShellFocused,
            showError && styles.inputShellError,
          ]}
        >
          {icon != null && <View style={styles.icon}>{icon}</View>}
          <TextInput
            {...inputProps}
            secureTextEntry={hidden}
            onFocus={(e) => {
              setFocused(true);
              inputProps.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              inputProps.onBlur?.(e);
            }}
            style={styles.input}
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
          />
          {secure != null && (
            <Pressable
              onPress={() => setHidden((h) => !h)}
              hitSlop={10}
              style={styles.eye}
              accessibilityRole="button"
              accessibilityLabel={hidden ? t('auth.showPassword') : t('auth.hidePassword')}
            >
              {hidden ? (
                <Eye size={20} color={colors.textMuted} />
              ) : (
                <EyeOff size={20} color={colors.textMuted} />
              )}
            </Pressable>
          )}
        </View>
      </Animated.View>
      <Animated.View style={{ opacity: errorOpacity }}>
        {showError && <Text style={styles.error}>{error}</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 6,
    marginLeft: 4,
  },
  labelFocused: {
    color: colors.primary,
  },
  labelError: {
    color: colors.error,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackgroundFocus,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  inputShellFocused: {
    borderColor: colors.primary,
  },
  inputShellError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.text,
  },
  icon: {
    marginRight: 12,
  },
  eye: {
    paddingLeft: 8,
  },
  error: {
    marginTop: 6,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.error,
  },
});
