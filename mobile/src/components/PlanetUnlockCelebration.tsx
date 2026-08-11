import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { planetOrbSource } from '../planets/planetLevels';

const RING_PULSES = 3;
const RING_MS = 760;
const FADE_IN_MS = 320;
const FADE_OUT_MS = 420;
/** Whole celebration length — long enough to read, short enough to not nag. */
const TOTAL_MS = 3200;

/**
 * Subtle celebration for a planet that just became available, rendered over
 * its tile in the Planets list:
 *
 * - a ring pulses outward from the tile edge three times, fading each time
 *   (the classic "unlock" cue, at a fraction of the energy of full confetti);
 * - the planet's own orb floats over the tile with a slow bob and a soft
 *   color glow, fading in and out around the pulse.
 *
 * Pure decoration, native-driver transforms only, and it stops itself — the
 * parent just renders it next to the newly-unlocked tile and forgets it.
 */
export function PlanetUnlockCelebration({
  planetNumber,
  color,
  size = 64,
  onDone,
}: {
  planetNumber: number;
  color: string;
  size?: number;
  onDone?: () => void;
}) {
  const ring = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const orb = planetOrbSource(planetNumber);

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(ring, {
            toValue: 1,
            duration: RING_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        { iterations: RING_PULSES },
      ),
      Animated.sequence([
        Animated.timing(appear, {
          toValue: 1,
          duration: FADE_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(TOTAL_MS - FADE_IN_MS - FADE_OUT_MS),
        Animated.timing(appear, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }),
      ]),
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 820, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 820, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    ]);

    animation.start();
    const timer = setTimeout(() => {
      animation.stop();
      onDone?.();
    }, TOTAL_MS);
    return () => {
      animation.stop();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orbWrap,
          {
            opacity: appear,
            transform: [
              { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] }) },
            ],
          },
        ]}
      >
        <View
          style={[
            styles.glow,
            {
              width: size * 0.92,
              height: size * 0.92,
              borderRadius: size * 0.46,
              backgroundColor: color,
            },
          ]}
        />
        {orb ? (
          <Animated.Image
            source={orb}
            resizeMode="contain"
            style={{ width: size * 0.74, height: size * 0.74 }}
          />
        ) : (
          <View
            style={{
              width: size * 0.74,
              height: size * 0.74,
              borderRadius: size * 0.37,
              backgroundColor: color,
            }}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 2.5,
  },
  orbWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    opacity: 0.32,
  },
});
