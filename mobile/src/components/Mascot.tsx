import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Hupy's own mascot — a friendly rounded space companion, original to this
 * app (not modeled on any existing brand's character). Gives the app a
 * "presence" during idle/connecting moments, in the same spirit as
 * Duolingo's owl without copying it. Bobs gently via core `Animated`
 * (consistent with the rest of the app — no reanimated worklets here).
 */
export function Mascot({ size = 96 }: { size?: number }) {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] });

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ translateY }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="mascotBody" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.brand.indigo} />
            <Stop offset="1" stopColor={colors.brand.purple} />
          </LinearGradient>
        </Defs>
        <Path d="M50 8 L50 20" stroke={colors.brand.purple} strokeWidth={3} strokeLinecap="round" />
        <Circle cx={50} cy={6} r={4} fill={colors.brand.mint} />
        <Ellipse cx={50} cy={58} rx={38} ry={34} fill="url(#mascotBody)" />
        <Circle cx={26} cy={64} r={6} fill="#F472B6" opacity={0.55} />
        <Circle cx={74} cy={64} r={6} fill="#F472B6" opacity={0.55} />
        <Circle cx={38} cy={54} r={9} fill="#FFFFFF" />
        <Circle cx={62} cy={54} r={9} fill="#FFFFFF" />
        <Circle cx={39.5} cy={55.5} r={4.2} fill="#1F1F1F" />
        <Circle cx={63.5} cy={55.5} r={4.2} fill="#1F1F1F" />
        <Path d="M42 70 Q50 78 58 70" stroke="#1F1F1F" strokeWidth={3} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}
