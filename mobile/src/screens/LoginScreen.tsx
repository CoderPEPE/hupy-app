import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Lock, Mail } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthLayout } from '../components/AuthLayout';
import { AuthTextField } from '../components/AuthTextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { GoogleMark } from '../components/SocialAuthRow';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useT } from '../i18n';
import { useAuthStore } from '../store/auth';
import { colors, radius, spacing } from '../theme';
import { isValidEmail } from '../utils/validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/** Full-width outlined action — the Google and create-account rows under the form. */
function OutlineButton({
  label,
  onPress,
  icon,
  strong,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  /** Purple bold text, for the create-account row. */
  strong?: boolean;
}) {
  return (
    <Pressable style={styles.outline} onPress={onPress} accessibilityRole="button">
      {icon}
      <Text style={[styles.outlineText, strong && styles.outlineTextStrong]}>{label}</Text>
    </Pressable>
  );
}

export function LoginScreen({ navigation }: Props) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const signIn = useAuthStore((s) => s.signIn);

  // Staggered entrance for the form fields
  const fieldIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fieldIn, {
      toValue: 1,
      duration: 500,
      delay: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fieldIn]);

  // Reusable animated style for a staggered field entrance.
  const fieldStyle = () => ({
    opacity: fieldIn,
    transform: [
      {
        translateY: fieldIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
      },
    ],
  });

  const mutation = useMutation({
    mutationFn: () => signIn(email.trim(), password),
    onError: (err) => {
      const message = err instanceof Error ? err.message : t('common.somethingWrong');
      setFieldErrors((prev) => ({ ...prev, password: message }));
    },
  });

  const handleSubmit = () => {
    const errors: { email?: string; password?: string } = {};
    if (!isValidEmail(email)) errors.email = t('auth.emailInvalid');
    if (password.length === 0) errors.password = t('auth.passwordRequired');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    mutation.mutate();
  };

  return (
    <AuthLayout
      logo={require('../../assets/brand/logo-wordmark.png')}
      mascot={require('../../assets/brand/mascot-astronaut.png')}
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      onLanguagePress={() => navigation.navigate('LanguageSelect')}
      scroll={false}
    >
      <Animated.View style={fieldStyle()}>
        <AuthTextField
          icon={<Mail size={20} color={colors.primary} />}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.email')}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
          returnKeyType="next"
          error={fieldErrors.email}
        />
      </Animated.View>

      <Animated.View style={fieldStyle()}>
        <AuthTextField
          icon={<Lock size={20} color={colors.primary} />}
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.password')}
          secure
          autoComplete="password"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          error={fieldErrors.password}
        />
      </Animated.View>

      <Animated.View style={[styles.submit, fieldStyle()]}>
        <PrimaryButton
          title={t('auth.login.submit').toUpperCase()}
          onPress={handleSubmit}
          loading={mutation.isPending}
        />
      </Animated.View>

      <Pressable style={styles.forgotRow} hitSlop={8}>
        <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>{t('auth.login.or')}</Text>
        <View style={styles.divider} />
      </View>

      <OutlineButton
        label={t('auth.login.continueWithProvider', { provider: 'Google' })}
        onPress={() => {}}
        icon={<GoogleMark size={20} />}
      />
      <View style={styles.outlineGap} />
      <OutlineButton
        label={t('auth.login.createAccount')}
        onPress={() => navigation.navigate('Register')}
        strong
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  submit: {
    marginTop: spacing.sm,
  },
  forgotRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  forgotText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: 14,
    color: colors.textMuted,
  },
  outline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  outlineGap: {
    height: spacing.sm,
  },
  outlineText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  outlineTextStrong: {
    fontWeight: '800',
    color: colors.primary,
  },
});
