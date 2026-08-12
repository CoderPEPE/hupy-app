import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT, type TranslationKey } from '../i18n';
import { colors, radius, typography } from '../theme';
import type { BlockState, PlanetStatus } from '../types';

/**
 * The one place a planet or block state becomes a label and a colour.
 * Both state machines are the spec's §6 lists, and both are rendered on
 * several screens — routing them through here is what keeps "Em andamento"
 * from meaning one colour on the journey list and another inside a planet.
 */

type Look = { fg: string; bg: string; labelKey: TranslationKey };

const PLANET_LOOKS: Record<PlanetStatus, Look> = {
  locked: { fg: colors.textFaint, bg: colors.surface, labelKey: 'state.locked' },
  available: { fg: colors.info, bg: colors.infoSoft, labelKey: 'state.available' },
  in_progress: { fg: colors.primary, bg: colors.primarySoft, labelKey: 'state.inProgress' },
  review: { fg: colors.brand.orange, bg: colors.warningSoft, labelKey: 'state.review' },
  conquered: { fg: colors.success, bg: colors.successSoft, labelKey: 'state.conquered' },
  mastered: { fg: '#B45309', bg: '#FEF3C7', labelKey: 'state.mastered' },
};

const BLOCK_LOOKS: Record<BlockState, Look> = {
  locked: { fg: colors.textFaint, bg: colors.surface, labelKey: 'state.locked' },
  available: { fg: colors.info, bg: colors.infoSoft, labelKey: 'state.available' },
  in_progress: { fg: colors.primary, bg: colors.primarySoft, labelKey: 'state.inProgress' },
  completed: { fg: colors.success, bg: colors.successSoft, labelKey: 'state.completed' },
  review: { fg: colors.brand.orange, bg: colors.warningSoft, labelKey: 'state.review' },
  mastered: { fg: '#B45309', bg: '#FEF3C7', labelKey: 'state.mastered' },
};

export function planetStateLook(status: PlanetStatus): Look {
  return PLANET_LOOKS[status] ?? PLANET_LOOKS.available;
}

export function blockStateLook(state: BlockState): Look {
  return BLOCK_LOOKS[state] ?? BLOCK_LOOKS.available;
}

export function StateChip({
  status,
  block,
  dark = false,
}: {
  status?: PlanetStatus;
  block?: BlockState;
  /** On the dark space background the soft fills disappear — outline instead. */
  dark?: boolean;
}) {
  const t = useT();
  const look = block ? blockStateLook(block) : planetStateLook(status ?? 'available');
  return (
    <View
      style={[
        styles.chip,
        dark
          ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: look.fg }
          : { backgroundColor: look.bg },
      ]}
    >
      <Text style={[styles.text, { color: look.fg }]}>{t(look.labelKey)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.round,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
  },
});
