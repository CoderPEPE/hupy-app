import React, { useMemo } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { planetOrbSource } from '../planets/planetLevels';
import { colors } from '../theme';

/**
 * A bare planet sphere for light surfaces.
 *
 * `PlanetTile` draws a coloured *square* tile, which shows its opaque
 * background when placed on a white card — the journey view needs the planet
 * itself with nothing behind it. Planets 1-8 have transparent cutout art;
 * everything up to 60 falls back to a drawn sphere derived from the planet's
 * own accent colour, so no planet is ever missing its orb.
 */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: number, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (c: number) => Math.round(c + (target - c) * t);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

const lighten = (hex: string, t: number) => mix(hex, 255, t);
const darken = (hex: string, t: number) => mix(hex, 0, t);

function seededRandom(seed: number) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function PlanetOrb({
  planetNumber,
  color,
  size = 64,
  locked = false,
}: {
  planetNumber: number;
  color: string;
  size?: number;
  locked?: boolean;
}) {
  const art = planetOrbSource(planetNumber);
  // A locked planet reads as "not yet yours": drained of colour, not hidden.
  const tint = locked ? '#B9B7C9' : color;

  const craters = useMemo(() => {
    const rand = seededRandom(planetNumber * 7919);
    return Array.from({ length: 5 }, () => {
      // Keep craters inside the disc: polar placement with a margin.
      const angle = rand() * Math.PI * 2;
      const dist = rand() * 0.58;
      return {
        cx: size / 2 + Math.cos(angle) * dist * (size / 2),
        cy: size / 2 + Math.sin(angle) * dist * (size / 2),
        r: size * (0.045 + rand() * 0.055),
        o: 0.16 + rand() * 0.2,
      };
    });
  }, [planetNumber, size]);

  if (art) {
    return (
      <Image
        source={art}
        style={{ width: size, height: size, opacity: locked ? 0.45 : 1 }}
        resizeMode="contain"
      />
    );
  }

  const gradId = `orb-${planetNumber}`;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradId} cx="34%" cy="30%" r="78%">
            <Stop offset="0%" stopColor={lighten(tint, 0.5)} />
            <Stop offset="45%" stopColor={lighten(tint, 0.08)} />
            <Stop offset="100%" stopColor={darken(tint, 0.4)} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={`url(#${gradId})`} />
        {craters.map((c, i) => (
          <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={darken(tint, 0.35)} opacity={c.o} />
        ))}
        {/* Specular highlight — what makes it read as a sphere, not a disc. */}
        <Ellipse
          cx={size * 0.35}
          cy={size * 0.28}
          rx={size * 0.17}
          ry={size * 0.09}
          fill={colors.background}
          opacity={0.28}
          transform={`rotate(-28 ${size * 0.35} ${size * 0.28})`}
        />
      </Svg>
    </View>
  );
}
