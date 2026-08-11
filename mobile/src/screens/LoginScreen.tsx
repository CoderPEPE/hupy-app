import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthLayout } from '../components/AuthLayout';
import { AuthTextField } from '../components/AuthTextField';
import { PrimaryButton } from '../components/PrimaryButton';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useT } from '../i18n';
import { useAuthStore } from '../store/auth';
import { colors, spacing } from '../theme';
import { isValidEmail } from '../utils/validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

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
      logo={require('../../assets/logo.jpg')}
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
    >
      <Animated.View style={fieldStyle()}>
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

      <Animated.View style={fieldStyle()}>
        <AuthTextField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.login.passwordPlaceholder')}
          secure
          autoComplete="password"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          error={fieldErrors.password}
        />
      </Animated.View>

      <Animated.View style={fieldStyle()}>
        <PrimaryButton title={t('auth.login.submit')} onPress={handleSubmit} loading={mutation.isPending} />
      </Animated.View>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>{t('auth.login.or')}</Text>
        <View style={styles.divider} />
      </View>

      <Pressable
        style={styles.linkRow}
        onPress={() => navigation.navigate('Register')}
        hitSlop={8}
      >
        <Text style={styles.linkText}>
          {t('auth.login.noAccount')}
          <Text style={styles.linkStrong}>{t('auth.login.createAccount')}</Text>
        </Text>
      </Pressable>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  linkRow: {
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
});
