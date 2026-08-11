import {
  Check,
  ChevronRight,
  Flame,
  Globe,
  LogOut,
  Mic,
  Settings,
  Star,
  Trophy,
  User,
  X,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useGamificationStats, queryKeys } from '../api/hooks';
import type { Badge } from '../api/gamification';
import { AchievementsModal } from '../components/AchievementsModal';
import { achievementIcon } from '../components/achievementIcons';
import { AppTabBar } from '../components/AppTabBar';
import { AuthTextField } from '../components/AuthTextField';
import { LanguagePickerModal } from '../components/LanguagePickerModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProfileBackdrop } from '../components/ProfileBackdrop';
import { VoicePickerModal, currentVoiceLabel } from '../components/VoicePickerModal';
import { Card, IconButton, ScreenHeader } from '../components/ui';
import { languageKey, useT } from '../i18n';
import { TIER_KEYS, levelFromXp, tierForLevel } from '../gamification/levels';
import { useAuthStore } from '../store/auth';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { displayName } from '../utils/userName';

/** How many badges the list shows before "View all". */
const BADGE_PREVIEW_COUNT = 3;

function StatColumn({
  icon,
  value,
  label,
  hint,
  hintColor,
  divider,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  hint?: string;
  hintColor?: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.statCol, divider && styles.statColDivider]}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint != null && <Text style={[styles.statHint, hintColor != null && { color: hintColor }]}>{hint}</Text>}
    </View>
  );
}

/** The backend ships an `icon` slug per badge (see the badges table); map it
 * to the matching lucide glyph rather than showing one generic icon. */
function BadgeRow({ badge }: { badge: Badge }) {
  const { Icon } = achievementIcon(badge.icon);
  return (
    <Card row style={styles.badgeRow}>
      <View style={[styles.badgeIcon, { backgroundColor: colors.primarySoft }]}>
        <Icon size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.badgeTitle}>{badge.title}</Text>
        <Text style={styles.badgeDesc}>{badge.description}</Text>
      </View>
      {/* Everything the API returns is already earned, so the check is a
          statement of fact rather than a toggle. */}
      <View style={styles.badgeCheck}>
        <Check size={16} color={colors.primary} strokeWidth={3} />
      </View>
    </Card>
  );
}

/** Minimal settings sheet behind the header gear. The reference has no
 * visible sign-out on the page itself, so it lives here. */
function SettingsSheet({ visible, onClose, onSignOut }: { visible: boolean; onClose: () => void; onSignOut: () => void }) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('profile.settings')}</Text>
            <IconButton onPress={onClose} accessibilityLabel={t('common.tryAgain')}>
              <X size={18} color={colors.textMuted} />
            </IconButton>
          </View>
          <Pressable style={styles.signOutBtn} onPress={onSignOut}>
            <LogOut size={16} color={colors.error} />
            <Text style={styles.signOutText}>{t('chat.logOut')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Sheet for editing the learner's display name. Saving persists to the
 * backend; the header, chat greeting, voice-picker preview and the tutor's
 * spoken address all pick the new name up from the user store. */
function NameEditModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const setName = useAuthStore((s) => s.setName);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Seed the input with the current name on the open transition only — an
  // unrelated user-store update while the modal is open must not wipe what
  // the learner is typing (getState reads the user fresh at that moment).
  useEffect(() => {
    if (!visible) return;
    setValue(displayName(useAuthStore.getState().user));
    setError(undefined);
  }, [visible]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t('auth.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await setName(trimmed);
      onClose();
    } catch {
      setError(t('common.somethingWrong'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('profile.editName')}</Text>
            <IconButton onPress={onClose} accessibilityLabel={t('common.tryAgain')}>
              <X size={18} color={colors.textMuted} />
            </IconButton>
          </View>
          <AuthTextField
            label={t('auth.name')}
            value={value}
            onChangeText={(v) => {
              setValue(v);
              if (error) setError(undefined);
            }}
            placeholder={t('auth.namePlaceholder')}
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="done"
            onSubmitEditing={save}
            error={error}
            autoFocus
          />
          <View style={styles.nameSaveRow}>
            <PrimaryButton title={t('profile.saveName')} onPress={save} loading={saving} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ProfileScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { data: gamification } = useGamificationStats();
  const queryClient = useQueryClient();
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  // Closing the language picker may have switched courses — refetch the
  // planet list, per-planet data and catalog so the app shows the new course.
  const closeLanguagePicker = () => {
    setLanguagePickerOpen(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.planets });
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
  };

  const email = user?.email ?? '';
  const firstName = displayName(user);
  // The change-language row shows the learner's course as the ordered
  // (base → target) pair — e.g. "Português → English" or "Español → English"
  // — not the app's UI locale, which follows the base language.
  // Both halves must resolve to a real language: before the user loads, the
  // pair is unknown, and half a pair ("Português → language.undefined") is
  // worse than none.
  const baseKey = languageKey(user?.base_language ?? (user?.language === 'pt' ? 'en' : 'pt'));
  const targetKey = languageKey(user?.language);
  const courseLabel = baseKey && targetKey ? `${t(baseKey)} → ${t(targetKey)}` : '';
  // The voice row shows the name of the voice actually in effect — the
  // stored choice, or the course's default when none was picked yet.
  const voiceLabel = currentVoiceLabel(user?.voice ?? '', user?.language ?? 'en');
  const xp = gamification?.xp ?? 0;
  const level = levelFromXp(xp);
  const streak = gamification?.streak_days ?? 0;
  const longest = gamification?.longest_streak ?? 0;
  const badges = gamification?.badges ?? [];
  const visibleBadges = showAllBadges ? badges : badges.slice(0, BADGE_PREVIEW_COUNT);
  const achievements = gamification?.achievements ?? [];
  const earnedCount = gamification?.earned_count ?? 0;
  const totalCount = gamification?.total_count ?? achievements.length;

  return (
    <View style={styles.screen}>
      <ProfileBackdrop />

      <ScreenHeader
        title={t('tabBar.profile')}
        right={
          <IconButton onPress={() => setSettingsOpen(true)} accessibilityLabel={t('profile.settings')}>
            <Settings size={20} color={colors.text} />
          </IconButton>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Image
                source={require('../../assets/brand/mascot-astronaut.png')}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            </View>
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{firstName || t('chat.guestName')}</Text>
            <View style={styles.levelPill}>
              <Text style={styles.levelPillText}>{t('profile.levelShort', { level })}</Text>
            </View>
          </View>
          <Text style={styles.email}>{email}</Text>
        </View>

        <Card style={styles.statsCard}>
          <View style={styles.statsRow}>
            <StatColumn
              icon={<Flame size={22} color="#F97316" fill={streak > 0 ? '#F97316' : 'none'} />}
              value={`${streak}`}
              label={t('profile.streak')}
              hint={streak > 0 ? t('profile.streakKeepGoing') : t('profile.streakStart')}
              hintColor={streak > 0 ? '#F97316' : colors.textFaint}
            />
            <StatColumn
              divider
              icon={<Star size={22} color={colors.gold} fill={colors.gold} />}
              value={`${level}`}
              label={t('profile.level')}
              hint={t(TIER_KEYS[tierForLevel(level)])}
              hintColor={colors.primary}
            />
            <StatColumn
              divider
              icon={<Trophy size={22} color={colors.primary} />}
              value={`${longest}`}
              label={t('profile.bestStreak')}
              // Only claim a personal best when the current streak has actually
              // matched it (and there is a streak at all).
              hint={longest > 0 && streak >= longest ? t('profile.streakPersonalBest') : undefined}
              hintColor={colors.primary}
            />
          </View>
        </Card>

        <Card row style={styles.settingRow} onPress={() => setLanguagePickerOpen(true)}>
          <View style={styles.settingIcon}>
            <Globe size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>{t('language.change')}</Text>
            <Text style={styles.settingSub}>{t('profile.changeLanguageSub')}</Text>
          </View>
          <Text style={styles.settingValue} numberOfLines={1}>
            {courseLabel}
          </Text>
          <ChevronRight size={18} color={colors.textFaint} />
        </Card>

        <Card row style={styles.settingRow} onPress={() => setVoicePickerOpen(true)}>
          <View style={styles.settingIcon}>
            <Mic size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>{t('voicePicker.title')}</Text>
            <Text style={styles.settingSub}>{t('profile.changeVoiceSub')}</Text>
          </View>
          <Text style={styles.settingValue} numberOfLines={1}>
            {voiceLabel}
          </Text>
          <ChevronRight size={18} color={colors.textFaint} />
        </Card>

        <Card row style={styles.settingRow} onPress={() => setNameEditOpen(true)}>
          <View style={styles.settingIcon}>
            <User size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>{t('auth.name')}</Text>
            <Text style={styles.settingSub}>{t('profile.changeNameSub')}</Text>
          </View>
          <Text style={styles.settingValue} numberOfLines={1}>
            {firstName || t('profile.nameFallback')}
          </Text>
          <ChevronRight size={18} color={colors.textFaint} />
        </Card>

        <View style={styles.badgesHeader}>
          <Text style={styles.badgesTitle}>{t('profile.badges')}</Text>
          {/* Always available: the locked ones are the interesting part, so
              this opens the full catalog rather than expanding in place. */}
          <Pressable style={styles.viewAll} onPress={() => setAchievementsOpen(true)} hitSlop={6}>
            <Text style={styles.viewAllText}>
              {t('achievements.earnedOf', { earned: earnedCount, total: totalCount })}
            </Text>
            <ChevronRight size={16} color={colors.primary} />
          </Pressable>
        </View>

        {badges.length === 0 ? (
          <Card style={styles.emptyBadges}>
            <Text style={styles.emptyBadgesText}>{t('profile.noBadges')}</Text>
          </Card>
        ) : (
          visibleBadges.map((b) => <BadgeRow key={b.code} badge={b} />)
        )}
      </ScrollView>

      <AppTabBar />
      <LanguagePickerModal visible={languagePickerOpen} onClose={closeLanguagePicker} />
      <VoicePickerModal visible={voicePickerOpen} onClose={() => setVoicePickerOpen(false)} />
      <NameEditModal visible={nameEditOpen} onClose={() => setNameEditOpen(false)} />
      <AchievementsModal
        visible={achievementsOpen}
        onClose={() => setAchievementsOpen(false)}
        achievements={achievements}
        earnedCount={earnedCount}
      />
      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} onSignOut={signOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  identity: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  avatarRing: {
    width: 132,
    height: 132,
    borderRadius: radius.round,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: radius.round,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '112%',
    height: '112%',
    marginTop: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  name: {
    ...typography.display,
    fontSize: 26,
    color: colors.text,
  },
  levelPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelPillText: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.primary,
  },
  email: {
    ...typography.body,
    marginTop: 4,
    color: colors.textMuted,
  },
  statsCard: {
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  statColDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  statValue: {
    ...typography.display,
    fontSize: 24,
    marginTop: 6,
    color: colors.text,
  },
  statLabel: {
    ...typography.body,
    marginTop: 2,
    color: colors.textMuted,
  },
  statHint: {
    ...typography.caption,
    marginTop: 6,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  settingRow: {
    marginTop: spacing.md,
  },
  settingIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    ...typography.section,
    color: colors.text,
  },
  settingSub: {
    ...typography.caption,
    marginTop: 1,
    color: colors.textMuted,
  },
  settingValue: {
    ...typography.label,
    color: colors.text,
    // Without a cap the value takes its full intrinsic width and leaves the
    // flex:0-basis title with none, wrapping it one letter per line.
    flexShrink: 1,
    maxWidth: '45%',
    textAlign: 'right',
  },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  badgesTitle: {
    ...typography.display,
    fontSize: 22,
    color: colors.text,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    ...typography.label,
    color: colors.primary,
  },
  badgeRow: {
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTitle: {
    ...typography.section,
    color: colors.text,
  },
  badgeDesc: {
    ...typography.body,
    marginTop: 2,
    color: colors.textMuted,
  },
  badgeCheck: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  emptyBadges: {
    alignItems: 'center',
  },
  emptyBadgesText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(15,14,35,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    ...shadows.card,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.title,
    color: colors.text,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.errorSoft,
    paddingVertical: spacing.md,
  },
  signOutText: {
    ...typography.body,
    fontWeight: '800',
    color: colors.error,
  },
  nameSaveRow: {
    marginTop: spacing.md,
  },
});
