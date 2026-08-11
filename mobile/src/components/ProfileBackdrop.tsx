import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Soft lavender "deep space" wash behind the Profile screen — a faint
 * gradient with a couple of out-of-focus planets and a rocket trail. Purely
 * decorative and non-interactive; kept in SVG so it costs one flat draw and
 * scales to any screen size.
 */
export function ProfileBackdrop() {
  const { width, height } = useWindowDimensions();
  const h = Math.round(height * 0.62);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={h}>
        <Defs>
          <LinearGradient id="profileSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.authBlobPrimary} stopOpacity={0.75} />
            <Stop offset="0.55" stopColor={colors.authBackground} stopOpacity={0.6} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="profilePlanet" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
            <Stop offset="1" stopColor={colors.brand.lavender} stopOpacity={0.35} />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={width} height={h} fill="url(#profileSky)" />

        {/* large planet, top-right, mostly off-screen */}
        <Circle cx={width * 0.92} cy={h * 0.1} r={width * 0.34} fill="url(#profilePlanet)" opacity={0.5} />
        {/* smaller planet, left edge */}
        <Circle cx={-width * 0.05} cy={h * 0.42} r={width * 0.22} fill="url(#profilePlanet)" opacity={0.45} />
        {/* ringed planet, lower right */}
        <Circle cx={width * 0.86} cy={h * 0.56} r={width * 0.1} fill="url(#profilePlanet)" opacity={0.4} />
        <Ellipse
          cx={width * 0.86}
          cy={h * 0.56}
          rx={width * 0.17}
          ry={width * 0.045}
          stroke={colors.brand.lavender}
          strokeWidth={2}
          fill="none"
          opacity={0.3}
          transform={`rotate(-20 ${width * 0.86} ${h * 0.56})`}
        />

        {/* rocket trail */}
        <Path
          d={`M${width * 0.62} ${h * 0.34} Q ${width * 0.72} ${h * 0.29}, ${width * 0.8} ${h * 0.24}`}
          stroke={colors.brand.lavender}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
          opacity={0.35}
        />
        <Circle cx={width * 0.81} cy={h * 0.235} r={5} fill={colors.brand.lavender} opacity={0.5} />
      </Svg>
    </View>
  );
}
