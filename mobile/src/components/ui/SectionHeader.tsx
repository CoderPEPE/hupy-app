import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

/**
 * "Section title + optional action" row ("Your planets" / "See all"). Keeps
 * section headings on one type size and spacing across every screen.
 */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel != null && onAction != null && (
        <Pressable style={styles.actionRow} onPress={onAction} hitSlop={6}>
          <Text style={styles.action}>{actionLabel}</Text>
          <ChevronRight size={16} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.section,
    color: colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  action: {
    ...typography.label,
    color: colors.primary,
  },
});
