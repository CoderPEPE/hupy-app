import { BookOpen, Copy, MessagesSquare, User } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RingedPlanetIcon } from './icons/RingedPlanetIcon';
import { useT } from '../i18n';
import { useUiStore, type TabKey } from '../store/ui';
import { colors, radius } from '../theme';

type TabIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

// Layout fixed by the product brief: flashcards on the left, chat in the
// centre, planets (and their audio) on the right.
const SIDE_TABS: { key: TabKey; icon: TabIcon; labelKey: 'tabBar.planets' | 'tabBar.lessons' | 'tabBar.cards' | 'tabBar.profile' }[] = [
  { key: 'flashcards', icon: Copy, labelKey: 'tabBar.cards' },
  { key: 'lessons', icon: BookOpen, labelKey: 'tabBar.lessons' },
];
const RIGHT_TABS: typeof SIDE_TABS = [
  { key: 'planets', icon: RingedPlanetIcon, labelKey: 'tabBar.planets' },
  { key: 'profile', icon: User, labelKey: 'tabBar.profile' },
];

export function AppTabBar({ dark = false }: { dark?: boolean }) {
  const t = useT();
  const { activeTab, setTab } = useUiStore();
  const insets = useSafeAreaInsets();

  const barBg = dark ? 'rgba(10,12,28,0.94)' : colors.card;
  const borderColor = dark ? 'rgba(255,255,255,0.08)' : colors.border;
  const idle = dark ? 'rgba(255,255,255,0.55)' : colors.textFaint;
  const active = dark ? '#C9C2FF' : colors.primary;
  // Dark mode active tab = dark purple rounded rectangle (matches the reference design)
  const activePill = dark ? 'rgba(74,68,190,0.55)' : colors.primarySoft;
  const activePillBorder = dark ? 'rgba(139,124,246,0.5)' : 'transparent';

  const renderTab = ({ key, icon: Icon, labelKey }: (typeof SIDE_TABS)[number]) => {
    const isActive = activeTab === key;
    return (
      <Pressable
        key={key}
        onPress={() => setTab(key)}
        style={[styles.tab, isActive && { backgroundColor: activePill, borderColor: activePillBorder }]}
        hitSlop={6}
      >
        <Icon size={21} color={isActive ? active : idle} strokeWidth={isActive ? 2.4 : 2} />
        <Text style={[styles.label, { color: idle }, isActive && { color: active, fontWeight: '700' }]}>{t(labelKey)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { backgroundColor: barBg, borderTopColor: borderColor, paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.inner}>
        {SIDE_TABS.map(renderTab)}

        {/* Center: Chat — glowing purple circle */}
        <Pressable onPress={() => setTab('chat')} style={styles.chatButton} hitSlop={8}>
          <View style={[styles.chatGlow, activeTab === 'chat' && styles.chatGlowActive]}>
            <View style={[styles.chatButtonInner, activeTab === 'chat' && styles.chatButtonActive]}>
              <MessagesSquare
                size={24}
                color={colors.textOnPrimary}
                strokeWidth={2.4}
                fill={activeTab === 'chat' ? colors.textOnPrimary : 'none'}
              />
            </View>
          </View>
          <Text style={[styles.label, { color: idle }, activeTab === 'chat' && { color: active, fontWeight: '700' }]}>{t('tabBar.chat')}</Text>
        </Pressable>

        {RIGHT_TABS.map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  label: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '600',
  },
  chatButton: {
    flex: 1.1,
    alignItems: 'center',
    marginTop: -30,
  },
  chatGlow: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  chatGlowActive: {
    backgroundColor: 'rgba(139,124,246,0.28)',
    shadowColor: '#8B7CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 8,
  },
  chatButtonInner: {
    width: 56,
    height: 56,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatButtonActive: {
    backgroundColor: colors.primaryPressed,
  },
});
