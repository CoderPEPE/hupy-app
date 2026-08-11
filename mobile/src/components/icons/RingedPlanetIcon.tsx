import React from 'react';
import Svg, { Circle, Ellipse } from 'react-native-svg';

/** A ringed-planet glyph (Saturn-like) for the Planets tab — lucide has no
 * exact match, so this is a small hand-drawn outline icon in the same
 * stroke style as the surrounding lucide icons. */
export function RingedPlanetIcon({ size = 22, color = '#000000', strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={5.5} stroke={color} strokeWidth={strokeWidth} />
      <Ellipse cx={12} cy={12} rx={10.5} ry={3.4} stroke={color} strokeWidth={strokeWidth} transform="rotate(-20 12 12)" />
    </Svg>
  );
}
