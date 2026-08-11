import { Copy, Globe, MessagesSquare } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../i18n';
import { useUiStore } from '../store/ui';
import { colors, radius } from '../theme';

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

  return (
    <View style={[styles.bar, { backgroundColor: barBg, borderTopColor: borderColor, paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.inner}>
        {/* Left: Cards */}
        <Pressable
          onPress={() => setTab('flashcards')}
          style={[styles.tab, activeTab === 'flashcards' && { backgroundColor: activePill, borderColor: activePillBorder }]}
          hitSlop={6}
        >
          <Copy
            size={22}
            color={activeTab === 'flashcards' ? active : idle}
            strokeWidth={activeTab === 'flashcards' ? 2.4 : 2}
          />
          <Text style={[styles.label, { color: idle }, activeTab === 'flashcards' && { color: active, fontWeight: '700' }]}>
            {t('tabBar.cards')}
          </Text>
        </Pressable>

        {/* Center: Chat — glowing purple circle */}
        <Pressable onPress={() => setTab('chat')} style={styles.chatButton} hitSlop={8}>
          <View style={[styles.chatGlow, activeTab === 'chat' && styles.chatGlowActive]}>
            <View style={[styles.chatButtonInner, activeTab === 'chat' && styles.chatButtonActive]}>
              <MessagesSquare
                size={26}
                color={colors.textOnPrimary}
                strokeWidth={2.4}
                fill={activeTab === 'chat' ? colors.textOnPrimary : 'none'}
              />
            </View>
          </View>
          <Text style={[styles.label, { color: idle }, activeTab === 'chat' && { color: active, fontWeight: '700' }]}>{t('tabBar.chat')}</Text>
        </Pressable>

        {/* Right: Planets — dark purple rounded rect when active */}
        <Pressable
          onPress={() => setTab('planets')}
          style={[styles.tab, activeTab === 'planets' && { backgroundColor: activePill, borderColor: activePillBorder }]}
          hitSlop={6}
        >
          <Globe
            size={22}
            color={activeTab === 'planets' ? active : idle}
            strokeWidth={activeTab === 'planets' ? 2.4 : 2}
          />
          <Text style={[styles.label, { color: idle }, activeTab === 'planets' && { color: active, fontWeight: '700' }]}>{t('tabBar.planets')}</Text>
        </Pressable>
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
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  label: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '600',
  },
  chatButton: {
    flex: 1.2,
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
