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
import Svg, { Ellipse, Path } from 'react-native-svg';
import { LanguageSwitch } from './LanguageSwitch';
import { colors, radius, shadows, spacing } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Astronaut mascot PNG's own aspect ratio (1024x1536) — used to size it
 * without letterboxing or cropping at any hero height. */
const MASCOT_ASPECT = 1024 / 1536;

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

/** The tilted orbit line the mascot stands in front of. */
function Orbit({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={styles.orbit}>
      <Ellipse
        cx={width / 2}
        cy={height / 2}
        rx={width / 2 - 2}
        ry={height / 2 - 2}
        stroke={colors.authBlobPrimary}
        strokeWidth={1.5}
        fill="none"
      />
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
  /** false = compact: hero/mascot sized from the actual window height so the
   * form fits on one screen (it still scrolls if a short device can't hold it). */
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

  // In compact mode the mascot is sized from the actual window height instead
  // of fixed pixels, so it fills the gap between wordmark and headline on both
  // a small phone and a tall one.
  const mascotHeight = compact ? Math.round(windowHeight * 0.36) : 300;
  const orbitHeight = Math.round(windowHeight * 0.3);
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, compact && styles.contentCompact]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.languageSwitchWrap}>
            <LanguageSwitch onPress={onLanguagePress} />
          </View>

          <Animated.View
            style={[
              styles.hero,
              heroStyle,
              mascot != null && styles.heroWithMascot,
              // Compact: the hero absorbs the slack above the card, which pins
              // the wordmark to the top and the headline block to the bottom —
              // the mascot fills the gap between them.
              compact && mascot != null && styles.heroFill,
            ]}
          >
            {mascot != null && (
              <View style={styles.decorations} pointerEvents="none">
                <Orbit width={SCREEN_WIDTH * 1.05} height={orbitHeight} />
                <View style={styles.decorStarA}>
                  <StarSpark size={16} color={colors.brand.orange} />
                </View>
                <View style={styles.decorStarB}>
                  <StarSpark size={11} color={colors.brand.lavender} />
                </View>
                <View style={[styles.dot, styles.dotA]} />
                <View style={[styles.dot, styles.dotB]} />
                <View style={[styles.dot, styles.dotC]} />
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
            <View>
              <Text style={[styles.title, mascot != null && styles.titleLeft, compact && styles.titleCompact]}>
                {/* A headline ending in a full stop gets it in orange, the brand's
                    one warm accent — "Seu inglês começa aqui." */}
                {title.endsWith('.') ? title.slice(0, -1) : title}
                {title.endsWith('.') && <Text style={styles.titleStop}>.</Text>}
              </Text>
              {mascot != null && <View style={styles.titleRule} />}
              <Text style={[styles.subtitle, mascot != null && styles.subtitleLeft, compact && styles.subtitleCompact]}>
                {subtitle}
              </Text>
            </View>
            {mascot != null && (
              <Image
                source={mascot}
                style={[styles.mascotImage, compact && { width: mascotWidth, height: mascotHeight, bottom: -36, right: -46 }]}
                resizeMode="contain"
              />
            )}
          </Animated.View>

          <Animated.View style={[styles.card, cardStyle, compact && styles.cardCompact]}>{children}</Animated.View>
          {belowCard != null && <View style={[styles.belowCard, compact && styles.belowCardCompact]}>{belowCard}</View>}
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
    alignSelf: 'flex-end',
    marginBottom: spacing.sm,
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
  heroFill: {
    flexGrow: 1,
    flexShrink: 0,
    paddingBottom: 0,
    justifyContent: 'space-between',
  },
  orbit: {
    position: 'absolute',
    top: '4%',
    left: '-16%',
    transform: [{ rotate: '-12deg' }],
  },
  dot: {
    position: 'absolute',
    borderRadius: radius.round,
    backgroundColor: colors.brand.lavender,
    opacity: 0.5,
  },
  dotA: {
    width: 14,
    height: 14,
    top: '4%',
    left: '58%',
  },
  dotB: {
    width: 9,
    height: 9,
    top: '20%',
    right: '2%',
  },
  dotC: {
    width: 11,
    height: 11,
    top: '38%',
    left: '-2%',
  },
  decorations: {
    ...StyleSheet.absoluteFill,
  },
  decorStarA: {
    position: 'absolute',
    top: '9%',
    right: '14%',
  },
  decorStarB: {
    position: 'absolute',
    top: '2%',
    left: '4%',
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
    width: 252,
    height: 82,
    marginBottom: 0,
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
    color: colors.primary,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  titleStop: {
    color: colors.brand.orange,
  },
  titleRule: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand.orange,
    marginTop: 14,
  },
  titleLeft: {
    textAlign: 'left',
    maxWidth: '68%',
  },
  titleCompact: {
    fontSize: 34,
    lineHeight: 41,
    maxWidth: '70%',
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
    marginTop: 12,
    fontSize: 15,
    lineHeight: 21,
    maxWidth: '54%',
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
    paddingBottom: 10,
  },
});
