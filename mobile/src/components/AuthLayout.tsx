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
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { LanguageSwitch } from './LanguageSwitch';
import { colors, radius, shadows, spacing } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Astronaut mascot PNG's own aspect ratio (853x1280) — used to size it
 * without letterboxing or cropping at any hero height. */
const MASCOT_ASPECT = 853 / 1280;

function StarSpark({ size = 14, color = colors.gold }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 0 C12.8 8.4 15.6 11.2 24 12 C15.6 12.8 12.8 15.6 12 24 C11.2 15.6 8.4 12.8 0 12 C8.4 11.2 11.2 8.4 12 0 Z"
        fill={color}
      />
    </Svg>
  );
}

function SpeechBubble({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.72} viewBox="0 0 40 29">
      <Path
        d="M4 0 H36 C38.2 0 40 1.8 40 4 V17 C40 19.2 38.2 21 36 21 H15 L7 28.5 V21 H4 C1.8 21 0 19.2 0 17 V4 C0 1.8 1.8 0 4 0 Z"
        fill="#FFFFFF"
        opacity={0.9}
      />
      <Path d="M9 8 H29 M9 13.5 H22" stroke={colors.brand.purple} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

type Props = {
  /** Brand logo image shown in the hero (optional, falls back to a mark). */
  logo?: ImageSourcePropType;
  /** Emoji or short brand mark shown when no logo is provided. */
  mark?: string;
  /** Mascot illustration (e.g. the astronaut) shown floating in the hero. */
  mascot?: ImageSourcePropType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Extra content rendered below the floating card, still on the atmosphere background. */
  belowCard?: React.ReactNode;
  /** Overrides the corner language pill's default instant-toggle behavior. */
  onLanguagePress?: () => void;
  /** false = fit everything on one screen, no ScrollView (hero/mascot sized
   * from the actual window height so it still fits on small devices). */
  scroll?: boolean;
};

/**
 * Shared canvas for the auth screens: a soft mint atmosphere with drifting
 * gradient blobs, a staggered hero, and the form raised on a floating card.
 */
export function AuthLayout({
  logo,
  mark,
  mascot,
  title,
  subtitle,
  children,
  belowCard,
  onLanguagePress,
  scroll = true,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const compact = !scroll;

  // In compact (no-scroll) mode, size the hero + mascot from the actual
  // window height instead of fixed pixels, so everything fits on one
  // screen on both a small phone and a tall one.
  const heroHeight = compact ? Math.round(windowHeight * 0.27) : undefined;
  const mascotHeight = compact ? Math.round(windowHeight * 0.25) : 300;
  const mascotWidth = Math.round(mascotHeight * MASCOT_ASPECT);

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
        <LanguageSwitch onPress={onLanguagePress} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Body scroll={scroll} style={[styles.content, compact && styles.contentCompact]}>
          <Animated.View
            style={[
              styles.hero,
              heroStyle,
              mascot != null && styles.heroWithMascot,
              compact && mascot != null && { paddingBottom: heroHeight },
            ]}
          >
            {mascot != null && (
              <View style={styles.decorations} pointerEvents="none">
                <View style={styles.decorBubble}>
                  <SpeechBubble size={compact ? 38 : 46} />
                </View>
                <View style={styles.decorStarA}>
                  <StarSpark size={16} />
                </View>
                <View style={styles.decorStarB}>
                  <StarSpark size={11} color={colors.brand.mint} />
                </View>
              </View>
            )}
            <View
              style={[
                styles.markWrap,
                logo != null && styles.markWrapLogo,
                mascot != null && styles.markWrapLeft,
                compact && styles.markWrapCompact,
              ]}
            >
              {logo != null ? (
                <Image source={logo} style={styles.logo} resizeMode="contain" />
              ) : (
                <Text style={styles.mark}>{mark}</Text>
              )}
            </View>
            <Text style={[styles.title, mascot != null && styles.titleLeft, compact && styles.titleCompact]}>
              {title}
            </Text>
            <Text style={[styles.subtitle, mascot != null && styles.subtitleLeft, compact && styles.subtitleCompact]}>
              {subtitle}
            </Text>
            {mascot != null && (
              <Image
                source={mascot}
                style={[styles.mascotImage, compact && { width: mascotWidth, height: mascotHeight }]}
                resizeMode="contain"
              />
            )}
          </Animated.View>

          <Animated.View style={[styles.card, cardStyle, compact && styles.cardCompact]}>{children}</Animated.View>
          {belowCard != null && <View style={[styles.belowCard, compact && styles.belowCardCompact]}>{belowCard}</View>}
        </Body>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Switches between a scrolling and a fixed (no-scroll) container without
 * duplicating the two call sites above. */
function Body({
  scroll,
  style,
  children,
}: {
  scroll: boolean;
  style: (ViewStyle | false | undefined)[];
  children: React.ReactNode;
}) {
  if (!scroll) {
    return <View style={style}>{children}</View>;
  }
  return (
    <ScrollView contentContainerStyle={style} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
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
  contentCompact: {
    flex: 1,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  heroWithMascot: {
    alignItems: 'flex-start',
    position: 'relative',
    paddingBottom: 180,
    marginBottom: spacing.md,
  },
  decorations: {
    ...StyleSheet.absoluteFill,
  },
  decorBubble: {
    position: 'absolute',
    top: -6,
    right: 6,
  },
  decorStarA: {
    position: 'absolute',
    top: 58,
    right: 30,
  },
  decorStarB: {
    position: 'absolute',
    top: 118,
    left: '58%',
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
  markWrapLeft: {
    width: 180,
    height: 58,
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    shadowOpacity: 0,
    elevation: 0,
    marginBottom: spacing.lg,
  },
  markWrapCompact: {
    width: 128,
    height: 42,
    marginBottom: spacing.sm,
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
  titleLeft: {
    textAlign: 'left',
    maxWidth: '68%',
  },
  titleCompact: {
    fontSize: 23,
    maxWidth: '100%',
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    lineHeight: 23,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  subtitleLeft: {
    textAlign: 'left',
    maxWidth: '64%',
  },
  subtitleCompact: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    maxWidth: '78%',
  },
  mascotImage: {
    position: 'absolute',
    right: -spacing.lg,
    bottom: -8,
    width: 200,
    height: 300,
  },
  belowCard: {
    marginTop: spacing.lg,
  },
  belowCardCompact: {
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    ...shadows.card,
  },
  cardCompact: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
});
