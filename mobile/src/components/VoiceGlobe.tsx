import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../theme';
import { audioLevels } from '../voice/audioLevels';

/**
 * The Chat centerpiece — a glossy 3D voice orb, ChatGPT-voice style.
 *
 * The orb is always alive:
 *  - it "breathes" gently while idle,
 *  - its warm highlight drifts slowly around the sphere,
 *  - the moment anyone talks, the real audio-level bus (`audioLevels`) drives
 *    the swell, the halo, and two ripples that radiate outward — the user's
 *    own voice and the tutor's playback both move it.
 *
 * Levels arrive ~10-25x/sec, so they're written straight into `Animated.Value`s
 * (smoothed with a cheap low-pass) — this never re-renders the screen. All
 * animations use core `Animated` on the JS driver, consistent with the rest of
 * the app (no reanimated worklet config is wired up in this project) and
 * because the level-driven styles mix a JS-written value into the loops.
 */
export function VoiceGlobe({
  active,
  onPress,
  accessibilityLabel,
  size = 200,
}: {
  /** The session is live (connecting / listening / speaking). */
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
}) {
  const level = useRef(new Animated.Value(0)).current;
  const idle = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const rippleA = useRef(new Animated.Value(0)).current;
  const rippleB = useRef(new Animated.Value(0)).current;

  // Live audio level → smoothed 0..1 (low-pass so the orb eases between
  // frames instead of snapping like the waveform's bars).
  useEffect(() => {
    let smoothed = 0;
    return audioLevels.subscribe((lvl) => {
      smoothed += (lvl - smoothed) * 0.5;
      level.setValue(smoothed);
    });
  }, [level]);

  // Idle breathing + drifting gloss + the two ripples (which stay invisible
  // until speech opens them up — their opacity is multiplied by `level`).
  useEffect(() => {
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(idle, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(idle, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    );
    const drift = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: false }),
    );
    const wave = (v: Animated.Value) =>
      Animated.loop(Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: false }));
    const a = wave(rippleA);
    const b = wave(rippleB);
    breathe.start();
    drift.start();
    a.start();
    // Half a period behind A, so the two ripples read as a continuous pulse.
    const stagger = setTimeout(() => b.start(), 1200);
    return () => {
      clearTimeout(stagger);
      breathe.stop();
      drift.stop();
      a.stop();
      b.stop();
    };
  }, [idle, spin, rippleA, rippleB]);

  // Core: idle breathing (0.98↔1.02) plus a live swell from speech.
  const orbScale = Animated.add(
    idle.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.02] }),
    level.interpolate({ inputRange: [0, 1], outputRange: [0, 0.1] }),
  );
  const glowScale = Animated.add(1, Animated.multiply(level, 0.22));
  const glowOpacity = Animated.add(active ? 0.55 : 0.42, Animated.multiply(level, 0.4));
  const glossRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const glow = size * 1.5;

  const ripple = (v: Animated.Value) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
    opacity: Animated.multiply(v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }), level),
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Soft halo — swells and brightens with speech. */}
      <Animated.View
        style={[styles.centered, { width: glow, height: glow, opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
        pointerEvents="none"
      >
        <Svg width={glow} height={glow} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="orbHalo" cx="50%" cy="50%" r="50%">
              <Stop offset="0.34" stopColor={colors.brand.lavender} stopOpacity="0.55" />
              <Stop offset="0.66" stopColor={colors.brand.lavender} stopOpacity="0.16" />
              <Stop offset="1" stopColor={colors.brand.lavender} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill="url(#orbHalo)" />
        </Svg>
      </Animated.View>

      {/* Ripples radiating out of the orb while someone is talking. */}
      <Animated.View style={[styles.centered, styles.ripple, ripple(rippleA)]} pointerEvents="none" />
      <Animated.View style={[styles.centered, styles.ripple, ripple(rippleB)]} pointerEvents="none" />

      {/* The sphere. */}
      <Animated.View style={{ transform: [{ scale: orbScale }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="orbBody" cx="34%" cy="28%" r="86%">
              <Stop offset="0" stopColor="#E7E3FE" />
              <Stop offset="0.34" stopColor="#BDB5F5" />
              <Stop offset="0.72" stopColor="#9C92EE" />
              <Stop offset="1" stopColor="#8377E7" />
            </RadialGradient>
            <RadialGradient id="orbSpecular" cx="33%" cy="25%" r="19%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="orbRim" cx="50%" cy="78%" r="60%">
              <Stop offset="0.74" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.75" />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill="url(#orbBody)" />
          <Circle cx={50} cy={50} r={50} fill="url(#orbSpecular)" />
          <Circle cx={50} cy={50} r={50} fill="url(#orbRim)" />
        </Svg>

        {/* Warm gloss, drifting slowly around the sphere so it never looks
            like a static sticker. Clipped to the sphere by the round wrap. */}
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.glossClip, { borderRadius: size / 2, transform: [{ rotate: glossRotate }] }]}
          pointerEvents="none"
        >
          <Svg width={size} height={size} viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id="orbWarm" cx="72%" cy="45%" r="36%">
                <Stop offset="0" stopColor="#FFE0C6" stopOpacity="0.85" />
                <Stop offset="0.42" stopColor="#FFC6A6" stopOpacity="0.4" />
                <Stop offset="1" stopColor="#FFC6A6" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx={50} cy={50} r={50} fill="url(#orbWarm)" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    borderWidth: 1.5,
    borderColor: colors.brand.lavender,
  },
  glossClip: {
    overflow: 'hidden',
  },
});
