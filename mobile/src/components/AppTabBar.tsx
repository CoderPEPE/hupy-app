import { AudioLines, Copy, Headphones, Home, Orbit, User } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../i18n';
import { useUiStore, type TabKey } from '../store/ui';
import { colors, radius } from '../theme';

type TabIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

// Home and Planets left, Flashcards / Audio / Profile right, Hupy Live
// floating in the centre.
const SIDE_TABS: { key: TabKey; icon: TabIcon; labelKey: 'tabBar.home' | 'tabBar.planets' }[] = [
  { key: 'home', icon: Home, labelKey: 'tabBar.home' },
  { key: 'planets', icon: Orbit, labelKey: 'tabBar.planets' },
];
const RIGHT_TABS: {
  key: TabKey;
  icon: TabIcon;
  labelKey: 'tabBar.cards' | 'tabBar.audio' | 'tabBar.profile';
}[] = [
  { key: 'flashcards', icon: Copy, labelKey: 'tabBar.cards' },
  { key: 'audio', icon: Headphones, labelKey: 'tabBar.audio' },
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

  const renderTab = ({ key, icon: Icon, labelKey }: (typeof SIDE_TABS)[number] | (typeof RIGHT_TABS)[number]) => {
    const isActive = activeTab === key;
    return (
      <Pressable key={key} onPress={() => setTab(key)} style={styles.tab} hitSlop={6}>
        {/* Active marker rides the top edge of the bar, above the icon. */}
        <View style={[styles.indicator, isActive && { backgroundColor: active }]} />
        <Icon size={21} color={isActive ? active : idle} strokeWidth={isActive ? 2.4 : 2} />
        <Text style={[styles.label, { color: idle }, isActive && { color: active, fontWeight: '700' }]}>{t(labelKey)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { backgroundColor: barBg, borderTopColor: borderColor, paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.inner}>
        {/* Equal-flex groups either side keep the floating centre button on
            the screen's midline even though the right group has one more tab. */}
        <View style={styles.group}>{SIDE_TABS.map(renderTab)}</View>

        {/* Center: Hupy Live — glowing purple circle */}
        <Pressable onPress={() => setTab('chat')} style={styles.chatButton} hitSlop={8}>
          <View style={[styles.chatGlow, activeTab === 'chat' && styles.chatGlowActive]}>
            <View style={[styles.chatButtonInner, activeTab === 'chat' && styles.chatButtonActive]}>
              <AudioLines size={26} color={colors.textOnPrimary} strokeWidth={2.4} />
            </View>
          </View>
          <Text style={[styles.label, { color: idle }, activeTab === 'chat' && { color: active, fontWeight: '700' }]}>{t('tabBar.chat')}</Text>
        </Pressable>

        <View style={styles.group}>{RIGHT_TABS.map(renderTab)}</View>
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
  group: {
    flex: 3,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  indicator: {
    width: 30,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginBottom: 7,
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
