import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

type Props = {
  /** 0..1 */
  value: number;
  color?: string;
  trackColor?: string;
  height?: number;
};

export function ProgressBar({ value, color = colors.primary, trackColor = colors.surface, height = 8 }: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: color, width: `${clamped * 100}%`, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
