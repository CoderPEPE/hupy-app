import { Check, ChevronDown } from 'lucide-react-native';
import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { colors, radius, spacing, typography } from '../../theme';

export type DropdownOption = {
  value: string;
  label: string;
  /** Optional leading glyph (a flag emoji, say). */
  icon?: string;
};

type Props = {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Shown collapsed when `value` matches no option. */
  placeholder?: string;
};

/**
 * Collapsed selector that opens its options in an overlay — the one control
 * that stays the same height whether it holds 3 options or 300 (the open list
 * is a FlatList, so only the visible rows render).
 */
export function Dropdown({ value, options, onChange, placeholder = '—' }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const pick = (next: string) => {
    setOpen(false);
    onChange(next);
  };

  return (
    <>
      <Card row style={styles.trigger} onPress={() => setOpen(true)}>
        {selected?.icon ? (
          <View style={styles.iconBadge}>
            <Text style={styles.icon}>{selected.icon}</Text>
          </View>
        ) : null}
        <Text style={styles.triggerText}>{selected?.label ?? placeholder}</Text>
        <ChevronDown size={18} color={colors.textFaint} />
      </Card>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              // Caps the overlay at roughly six rows; the rest scrolls.
              style={styles.list}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <Pressable
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => pick(item.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    {item.icon ? (
                      <View style={styles.iconBadge}>
                        <Text style={styles.icon}>{item.icon}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      {item.label}
                    </Text>
                    {isSelected && <Check size={16} color={colors.primary} strokeWidth={3} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    padding: spacing.sm + 2,
  },
  triggerText: {
    ...typography.cardTitle,
    flex: 1,
    fontWeight: '700',
    color: colors.text,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.round,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  icon: {
    fontSize: 20,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
  list: {
    maxHeight: 320,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  optionSelected: {
    backgroundColor: colors.primarySoft,
  },
  optionText: {
    ...typography.cardTitle,
    flex: 1,
    fontWeight: '700',
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.primary,
  },
});
