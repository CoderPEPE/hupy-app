import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue } from 'react-native';

const COLORS = ['#8B7CF6', '#F472B6', '#FBBF24', '#22D3EE', '#4ADE80'];
const PIECE_COUNT = 20;

type Piece = {
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  spin: number;
};

/** Deterministic per-burst scatter (seeded by `seed`) so re-renders during
 * one burst don't reshuffle the pieces mid-flight. */
function makePieces(seed: number): Piece[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => {
    const jitter = ((seed + i * 37) % 100) / 100 - 0.5;
    return {
      angle: (i / PIECE_COUNT) * Math.PI * 2 + jitter,
      distance: 70 + ((seed + i * 53) % 100),
      size: 5 + ((seed + i * 17) % 6),
      color: COLORS[i % COLORS.length],
      delay: (i * 13) % 150,
      duration: 700 + ((seed + i * 29) % 400),
      spin: i % 2 === 0 ? 1 : -1,
    };
  });
}

function ConfettiPiece({ piece }: { piece: Piece }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: piece.duration,
      delay: piece.delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.cos(piece.angle) * piece.distance],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.sin(piece.angle) * piece.distance + piece.distance * 0.4],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${piece.spin * 360}deg`],
  });
  const opacity = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: piece.size,
          height: piece.size * 1.6,
          backgroundColor: piece.color,
          opacity,
          transform: [{ translateX }, { translateY }, { rotate }],
        },
      ]}
    />
  );
}

/**
 * A one-shot celebratory burst, built entirely on React Native's core
 * `Animated` API (no `react-native-reanimated` worklets) — this project has
 * no babel config wiring the reanimated plugin, so worklet-based hooks
 * aren't safe to introduce here without being able to verify them on-device.
 *
 * Bump `burstKey` (any changing, non-zero number) to fire a new burst; the
 * same key re-fires nothing, so callers typically pass a counter or
 * `Date.now()`.
 */
export function Confetti({
  burstKey,
  origin = styles.defaultOrigin,
}: {
  burstKey: number;
  /** Where the burst explodes from, relative to the overlay. Defaults to the
   * upper-middle; callers celebrating a centered element (level-up card) pass
   * `{ top: '50%' }` so the ring radiates out of the card. */
  origin?: { top?: DimensionValue; left?: DimensionValue };
}) {
  if (!burstKey) return null;
  const pieces = makePieces(burstKey);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.origin, origin]}>
        {pieces.map((p, i) => (
          <ConfettiPiece key={`${burstKey}-${i}`} piece={p} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  defaultOrigin: {
    top: '30%',
    left: '50%',
  },
  origin: {
    position: 'absolute',
  },
  piece: {
    position: 'absolute',
    borderRadius: 2,
  },
});
