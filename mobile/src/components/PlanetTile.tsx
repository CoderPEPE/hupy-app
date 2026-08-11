import React, { useMemo } from 'react';
import { Image, type ImageSourcePropType, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { radius as themeRadius } from '../theme';

/**
 * Higgsfield-generated tile art (flat vector-illustration style matching the
 * reference exactly), keyed by planet number. Only a subset exists — the
 * rest hit Higgsfield's daily generation limit mid-batch — the SVG render
 * below is the fallback for whichever planet numbers aren't in this map.
 */
const TILE_IMAGES: Partial<Record<number, ImageSourcePropType>> = {
  1: require('../../assets/planet-tiles/mercury.png'),
  3: require('../../assets/planet-tiles/earth.png'),
  4: require('../../assets/planet-tiles/mars.png'),
  6: require('../../assets/planet-tiles/saturn.png'),
};

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

type Texture = 'craters' | 'continents' | 'smooth';

/** Hand-picked to match the reference art exactly for the first four planets
 * (a deep-purple Mercury tile with a teal sphere, gold Venus, green Earth,
 * pink Mars) — planets beyond that derive a tile from their own accent color. */
const TILE_STYLES: Record<number, { bg: string; sphere: string; texture: Texture; ring?: boolean }> = {
  1: { bg: '#4338CA', sphere: '#3FBFB0', texture: 'craters' },
  2: { bg: '#E0A52E', sphere: '#F3C969', texture: 'smooth', ring: true },
  3: { bg: '#16A34A', sphere: '#4FB0DA', texture: 'continents' },
  4: { bg: '#E2537E', sphere: '#F3A0BF', texture: 'smooth', ring: true },
};

function tileStyleFor(planetNumber: number, fallbackColor: string) {
  return (
    TILE_STYLES[planetNumber] ?? {
      bg: darken(fallbackColor, 0.35),
      sphere: fallbackColor,
      texture: 'craters' as Texture,
    }
  );
}

function Sparkle({ x, y, size, opacity }: { x: number; y: number; size: number; opacity: number }) {
  const d = `M${x} ${y - size} C${x + size * 0.15} ${y - size * 0.15}, ${x + size} ${y - size * 0.1}, ${x + size} ${y} C${x + size * 0.15} ${y + size * 0.15}, ${x + size * 0.1} ${y + size}, ${x} ${y + size} C${x - size * 0.15} ${y + size * 0.15}, ${x - size} ${y + size * 0.1}, ${x - size} ${y} C${x - size * 0.15} ${y - size * 0.15}, ${x - size * 0.1} ${y - size}, ${x} ${y - size} Z`;
  return <Path d={d} fill="#FFFFFF" opacity={opacity} />;
}

/** Square planet icon tile for the Home planet list — a solid colored square
 * with a gradient sphere, light surface texture, and sparkle accents,
 * matching the reference design exactly for planets 1-4. */
export function PlanetTile({
  planetNumber,
  color,
  size = 56,
  locked = false,
}: {
  planetNumber: number;
  color: string;
  size?: number;
  locked?: boolean;
}) {
  const style = tileStyleFor(planetNumber, color);
  const bg = style.bg;
  const sphere = style.sphere;
  const gradId = `planetTile-${planetNumber}`;
  const r = size * 0.32;
  const cx = size * 0.52;
  const cy = size * 0.5;

  const craters = useMemo(() => {
    if (style.texture !== 'craters') return [];
    const rand = seededRandom(planetNumber * 7919);
    return Array.from({ length: 4 }, () => ({
      x: cx + (rand() - 0.5) * r * 1.2,
      y: cy + (rand() - 0.5) * r * 1.2,
      cr: r * (0.08 + rand() * 0.1),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planetNumber, style.texture]);

  const continents = useMemo(() => {
    if (style.texture !== 'continents') return [];
    const rand = seededRandom(planetNumber * 313);
    return Array.from({ length: 3 }, () => ({
      x: cx + (rand() - 0.5) * r * 1.1,
      y: cy + (rand() - 0.5) * r * 1.1,
      rw: r * (0.18 + rand() * 0.14),
      rh: r * (0.12 + rand() * 0.1),
      rot: rand() * 180,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planetNumber, style.texture]);

  const sparkles = useMemo(() => {
    const rand = seededRandom(planetNumber * 131 + 4);
    const spots = [
      { x: size * 0.16, y: size * 0.18 },
      { x: size * 0.86, y: size * 0.2 },
      { x: size * 0.14, y: size * 0.84 },
      { x: size * 0.88, y: size * 0.82 },
    ];
    return spots.map((s) => ({ ...s, size: size * (0.028 + rand() * 0.02), opacity: 0.55 + rand() * 0.35 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planetNumber, size]);

  const image = TILE_IMAGES[planetNumber];
  if (image) {
    return (
      <View style={{ width: size, height: size, borderRadius: themeRadius.md, overflow: 'hidden' }}>
        <Image source={image} style={{ width: size, height: size }} resizeMode="cover" />
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size, borderRadius: themeRadius.md, overflow: 'hidden' }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradId} cx="35%" cy="30%" r="75%">
            <Stop offset="0%" stopColor={lighten(sphere, 0.4)} />
            <Stop offset="55%" stopColor={sphere} />
            <Stop offset="100%" stopColor={darken(sphere, 0.35)} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={bg} />
        {!locked && sparkles.map((s, i) => <Sparkle key={i} x={s.x} y={s.y} size={s.size} opacity={s.opacity} />)}

        {style.ring && (
          <G rotation={-18} origin={`${cx}, ${cy}`}>
            <Ellipse
              cx={cx}
              cy={cy}
              rx={r * 1.55}
              ry={r * 0.4}
              stroke={lighten(sphere, 0.5)}
              strokeWidth={size * 0.045}
              fill="none"
              opacity={0.85}
            />
          </G>
        )}

        <Circle cx={cx} cy={cy} r={r} fill={`url(#${gradId})`} />

        {craters.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={c.cr} fill={darken(sphere, 0.35)} opacity={0.4} />
        ))}
        {continents.map((c, i) => (
          <Ellipse
            key={i}
            cx={c.x}
            cy={c.y}
            rx={c.rw}
            ry={c.rh}
            fill={darken(sphere, 0.3)}
            opacity={0.55}
            transform={`rotate(${c.rot} ${c.x} ${c.y})`}
          />
        ))}

        <Ellipse
          cx={cx - r * 0.32}
          cy={cy - r * 0.34}
          rx={r * 0.32}
          ry={r * 0.16}
          fill="#FFFFFF"
          opacity={0.28}
          transform={`rotate(-28 ${cx - r * 0.32} ${cy - r * 0.34})`}
        />
      </Svg>
    </View>
  );
}
