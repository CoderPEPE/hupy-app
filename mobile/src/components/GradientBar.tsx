import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

let barCounter = 0;

type Props = {
  /** 0..1 */
  value: number;
  colors?: [string, string];
  trackColor?: string;
  height?: number;
};

/**
 * Progress bar with a horizontal gradient fill (purple -> blue), matching the
 * Huppy planets design. Measures its own width so the SVG fill can be exact.
 */
export function GradientBar({
  value,
  colors = ['#8B7CF6', '#4A63D9'],
  trackColor = 'rgba(255,255,255,0.08)',
  height = 8,
}: Props) {
  const [width, setWidth] = useState(0);
  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    barCounter += 1;
    idRef.current = `gradBar-${barCounter}`;
  }
  const gradId = idRef.current;
  const clamped = Math.max(0, Math.min(1, value));
  const fillW = width * clamped;
  const radius = height / 2;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={[styles.track, { height, borderRadius: radius, backgroundColor: trackColor }]} onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors[0]} />
              <Stop offset="1" stopColor={colors[1]} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={fillW} height={height} rx={radius} fill={`url(#${gradId})`} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
});
