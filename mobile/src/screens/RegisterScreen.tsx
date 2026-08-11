import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthLayout } from '../components/AuthLayout';
import { AuthTextField } from '../components/AuthTextField';
import { PrimaryButton } from '../components/PrimaryButton';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useT, type TranslationKey } from '../i18n';
import { useAuthStore } from '../store/auth';
import { colors, spacing } from '../theme';
import { isValidEmail, MIN_PASSWORD_LENGTH } from '../utils/validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

type Strength = { labelKey: TranslationKey | null; color: string; score: number };

function passwordStrength(pw: string): Strength {
  if (pw.length === 0) return { labelKey: null, color: colors.border, score: 0 };
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const map: Strength[] = [
    { labelKey: 'auth.register.strengthTooShort', color: colors.error, score: 1 },
    { labelKey: 'auth.register.strengthWeak', color: colors.error, score: 2 },
    { labelKey: 'auth.register.strengthOkay', color: colors.warning, score: 3 },
    { labelKey: 'auth.register.strengthGood', color: colors.primary, score: 4 },
    { labelKey: 'auth.register.strengthStrong', color: colors.success, score: 5 },
  ];
  // score can be 0 (a non-empty password that fails every criterion, e.g.
  // the very first keystroke) — clamp so that still maps to the weakest
  // tier instead of indexing map[-1] (undefined -> crash on render).
  return map[Math.max(0, Math.min(score, map.length) - 1)];
}

export function RegisterScreen({ navigation }: Props) {
  const t = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirm?: string;
  }>({});
  const signUp = useAuthStore((s) => s.signUp);

  const strength = useMemo(() => passwordStrength(password), [password]);

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

  const fieldStyle = {
    opacity: fieldIn,
    transform: [
      {
        translateY: fieldIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
      },
    ],
  };

  const mutation = useMutation({
    mutationFn: () => signUp(email.trim(), password, name),
    onError: (err) => {
      const message = err instanceof Error ? err.message : t('common.somethingWrong');
      setFieldErrors((prev) => ({ ...prev, email: message }));
    },
  });

  const handleSubmit = () => {
    const errors: typeof fieldErrors = {};
    if (name.trim().length === 0) errors.name = t('auth.nameRequired');
    if (!isValidEmail(email)) errors.email = t('auth.emailInvalid');
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = t('auth.register.passwordTooShort', { min: MIN_PASSWORD_LENGTH });
    }
    if (confirm !== password) errors.confirm = t('auth.register.passwordMismatch');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    mutation.mutate();
  };

  const passwordError =
    fieldErrors.password ??
    (strength.labelKey === 'auth.register.strengthTooShort' && password.length > 0
      ? t('auth.register.passwordTooShort', { min: MIN_PASSWORD_LENGTH })
      : undefined);

  return (
    <AuthLayout
      logo={require('../../assets/brand/logo-wordmark.png')}
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
    >
      <Animated.View style={fieldStyle}>
        <AuthTextField
          label={t('auth.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('auth.namePlaceholder')}
          autoComplete="name"
          autoCapitalize="words"
          returnKeyType="next"
          error={fieldErrors.name}
        />
      </Animated.View>

      <Animated.View style={fieldStyle}>
        <AuthTextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
          returnKeyType="next"
          error={fieldErrors.email}
        />
      </Animated.View>

      <Animated.View style={fieldStyle}>
        <AuthTextField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.register.passwordPlaceholder', { min: MIN_PASSWORD_LENGTH })}
          secure
          autoComplete="new-password"
          returnKeyType="next"
          error={passwordError}
        />
        {password.length > 0 && (
          <View style={styles.meterRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View
                key={i}
                style={[
                  styles.meterSegment,
                  {
                    backgroundColor: i <= strength.score ? strength.color : colors.surface,
                  },
                ]}
              />
            ))}
            {strength.labelKey && (
              <Text style={[styles.meterLabel, { color: strength.color }]}>{t(strength.labelKey)}</Text>
            )}
          </View>
        )}
      </Animated.View>

      <Animated.View style={fieldStyle}>
        <AuthTextField
          label={t('auth.register.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          placeholder={t('auth.register.confirmPlaceholder')}
          secure
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          error={fieldErrors.confirm}
        />
      </Animated.View>

      <Animated.View style={fieldStyle}>
        <PrimaryButton title={t('auth.register.submit')} onPress={handleSubmit} loading={mutation.isPending} />
      </Animated.View>

      <Pressable
        style={styles.linkRow}
        onPress={() => navigation.navigate('Login')}
        hitSlop={8}
      >
        <Text style={styles.linkText}>
          {t('auth.register.haveAccount')}
          <Text style={styles.linkStrong}>{t('auth.register.logIn')}</Text>
        </Text>
      </Pressable>

      <Text style={styles.terms}>
        {t('auth.termsPrefix')}
        <Text style={styles.termsLink}>{t('auth.terms')}</Text>
        {t('auth.and')}
        <Text style={styles.termsLink}>{t('auth.privacy')}</Text>.
      </Text>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 4,
    marginBottom: spacing.sm,
  },
  meterSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginRight: 6,
  },
  meterLabel: {
    marginLeft: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  linkRow: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  linkText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  linkStrong: {
    color: colors.primary,
    fontWeight: '800',
  },
  terms: {
    marginTop: spacing.md,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textFaint,
    textAlign: 'center',
  },
  termsLink: {
    color: colors.textMuted,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
