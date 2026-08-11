import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguageSwitch } from './LanguageSwitch';
import { colors, radius, shadows, spacing } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  /** Brand logo image shown in the hero (optional, falls back to a mark). */
  logo?: ImageSourcePropType;
  /** Emoji or short brand mark shown when no logo is provided. */
  mark?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

/**
 * Shared canvas for the auth screens: a soft mint atmosphere with drifting
 * gradient blobs, a staggered hero, and the form raised on a floating card.
 */
export function AuthLayout({ logo, mark, title, subtitle, children }: Props) {
  // Entrance choreography
  const hero = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;

  // Ambient blob drift
  const driftA = useRef(new Animated.Value(0)).current;
  const driftB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(hero, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(card, {
        toValue: 1,
        duration: 650,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loop = (value: Animated.Value, from: number, to: number, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: to, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(value, { toValue: from, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start();
    };
    loop(driftA, 0, 1, 5200);
    loop(driftB, 0, 1, 6800);
  }, [hero, card, driftA, driftB]);

  const heroStyle: Animated.WithAnimatedValue<ViewStyle> = {
    opacity: hero,
    transform: [
      { translateY: hero.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
      { scale: hero.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  };

  const cardStyle: Animated.WithAnimatedValue<ViewStyle> = {
    opacity: card,
    transform: [
      { translateY: card.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) },
    ],
  };

  const blobA = {
    opacity: driftA.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] }),
    transform: [
      { translateY: driftA.interpolate({ inputRange: [0, 1], outputRange: [0, -28] }) },
      { scale: driftA.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
    ],
  };

  const blobB = {
    opacity: driftB.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.45] }),
    transform: [
      { translateY: driftB.interpolate({ inputRange: [0, 1], outputRange: [0, 34] }) },
      { scale: driftB.interpolate({ inputRange: [0, 1], outputRange: [1.1, 0.95] }) },
    ],
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.atmosphere} pointerEvents="none">
        <Animated.View style={[styles.blob, styles.blobA, blobA]} />
        <Animated.View style={[styles.blob, styles.blobB, blobB]} />
        <View style={[styles.blob, styles.blobC]} />
      </View>

      <View style={styles.languageSwitchWrap}>
        <LanguageSwitch />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.hero, heroStyle]}>
            <View style={[styles.markWrap, logo != null && styles.markWrapLogo]}>
              {logo != null ? (
                <Image source={logo} style={styles.logo} resizeMode="contain" />
              ) : (
                <Text style={styles.mark}>{mark}</Text>
              )}
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </Animated.View>

          <Animated.View style={[styles.card, cardStyle]}>{children}</Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.authBackground,
  },
  flex: {
    flex: 1,
  },
  atmosphere: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: radius.round,
  },
  languageSwitchWrap: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 1,
  },
  blobA: {
    width: SCREEN_WIDTH * 1.15,
    height: SCREEN_WIDTH * 1.15,
    top: -SCREEN_WIDTH * 0.42,
    left: -SCREEN_WIDTH * 0.28,
    backgroundColor: colors.authBlobPrimary,
  },
  blobB: {
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_WIDTH * 0.9,
    top: -SCREEN_WIDTH * 0.12,
    right: -SCREEN_WIDTH * 0.42,
    backgroundColor: colors.authBlobSecondary,
  },
  blobC: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    bottom: -SCREEN_WIDTH * 0.3,
    left: -SCREEN_WIDTH * 0.18,
    backgroundColor: colors.authBlobTertiary,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  markWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.card,
  },
  markWrapLogo: {
    width: 232,
    height: 76,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  mark: {
    fontSize: 44,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    lineHeight: 23,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    ...shadows.card,
  },
});
