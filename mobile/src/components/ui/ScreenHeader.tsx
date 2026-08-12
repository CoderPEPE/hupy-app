import { ChevronLeft } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './IconButton';
import { useT } from '../../i18n';
import { colors, ICON_BUTTON_SIZE, radius, spacing, typography } from '../../theme';

type Props = {
  title?: string;
  /** Shown under the title (e.g. "Lesson 3 of 5"). */
  subtitle?: string;
  onBack?: () => void;
  /** Content pinned to the right (streak pill, avatar, overflow menu…). */
  right?: React.ReactNode;
  /** Content pinned to the left when there is no back button (menu icon). */
  left?: React.ReactNode;
  /**
   * `purple` is the filled brand header with a rounded bottom edge, used by
   * the focused study screens; `light` sits on the normal page background.
   */
  variant?: 'light' | 'purple';
  /** Centers the title (purple headers always center). */
  centerTitle?: boolean;
};

/**
 * The shared screen header. Every top-level screen used to hand-roll its own
 * header row, so paddings, title sizes and back-button styling drifted apart.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  left,
  variant = 'light',
  centerTitle,
}: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const onPurple = variant === 'purple';
  const centered = centerTitle ?? onPurple;

  const leading = onBack ? (
    <IconButton
      onPress={onBack}
      variant={onPurple ? 'plain' : 'surface'}
      accessibilityLabel={t('common.back')}
    >
      <ChevronLeft size={22} color={onPurple ? '#FFFFFF' : colors.text} />
    </IconButton>
  ) : (
    left
  );

  return (
    <View
      style={[
        styles.header,
        onPurple && styles.headerPurple,
        { paddingTop: insets.top + spacing.sm },
      ]}
    >
      {/* Fixed-width side slots keep a centered title optically centered
          regardless of how wide the right-hand content is. */}
      <View style={[styles.side, centered && styles.sideFixed]}>{leading}</View>

      {title != null && (
        <View style={[styles.titleWrap, centered ? styles.titleCentered : styles.titleLeading]}>
          <Text style={[styles.title, onPurple && styles.titleOnPurple]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle != null && (
            <Text style={[styles.subtitle, onPurple && styles.subtitleOnPurple]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      )}

      <View style={[styles.side, styles.sideRight, centered && styles.sideFixed]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerPurple: {
    backgroundColor: colors.primary,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl + 4,
    borderBottomRightRadius: radius.xl + 4,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sideFixed: {
    minWidth: ICON_BUTTON_SIZE,
  },
  sideRight: {
    justifyContent: 'flex-end',
    // Pushes the right slot to the edge on headers with no title to separate
    // it from the left one (Home: wordmark left, bell right).
    marginLeft: 'auto',
  },
  titleWrap: {
    flex: 1,
  },
  titleLeading: {
    marginLeft: spacing.sm,
  },
  titleCentered: {
    alignItems: 'center',
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  titleOnPurple: {
    color: '#FFFFFF',
  },
  subtitle: {
    ...typography.caption,
    marginTop: 1,
    color: colors.textMuted,
  },
  subtitleOnPurple: {
    color: 'rgba(255,255,255,0.75)',
  },
});
