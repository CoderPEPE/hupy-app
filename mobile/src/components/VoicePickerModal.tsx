import { Check, Mic, Volume2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { Card, ScreenHeader } from './ui';
import { useT, type TranslationKey } from '../i18n';
import { useAuthStore } from '../store/auth';
import { colors, radius, spacing, typography } from '../theme';
import { effectiveVoice, speechPlayer } from '../voice/ttsPlayer';
import { TUTOR_VOICES, tutorVoiceById, voiceGreeting, type TutorVoiceGender } from '../voice/tutorVoices';

const GENDER_LABEL: Record<TutorVoiceGender, TranslationKey> = {
  female: 'voicePicker.female',
  male: 'voicePicker.male',
};

/** Full-screen tutor-voice picker reached from Profile settings. Tapping a
 * voice selects it immediately (persisted to the backend); each row has a
 * play button that previews the voice saying the greeting in the learner's
 * target language, so the choice is heard, not just read. */
export function VoicePickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const setVoice = useAuthStore((s) => s.setVoice);
  const [playing, setPlaying] = useState<string | null>(null);

  const course = user?.language ?? 'en';
  const firstName = user?.email.split('@')[0] ?? '';
  // An empty stored voice means the course default is in effect — show that
  // as the current selection so the checkmark always reflects reality.
  const selected = effectiveVoice(user?.voice ?? '', course);
  const languageName = t(`language.${course}` as TranslationKey);

  const play = async (voiceId: string) => {
    if (playing) return; // one preview at a time
    setPlaying(voiceId);
    // Ephemeral: auditioning must not change the app's remembered voice.
    await speechPlayer.speak(voiceGreeting(course, firstName), voiceId, { ephemeral: true });
    setPlaying(null);
  };

  const select = (voiceId: string) => {
    // Persist best-effort: a network failure must not block the UI, and the
    // store updates only on success (so it stays truthful). On success also
    // sync the player, so a future clip that omits a voice uses the choice.
    setVoice(voiceId)
      .then(() => speechPlayer.setVoice(voiceId))
      .catch(() => {});
  };

  const voices = (gender: TutorVoiceGender) => TUTOR_VOICES.filter((v) => v.gender === gender);

  const renderVoice = (v: (typeof TUTOR_VOICES)[number]) => {
    const isSelected = selected === v.id;
    const isPlaying = playing === v.id;
    return (
      <Card key={v.id} row style={[styles.voiceRow, isSelected && styles.voiceRowSelected]} onPress={() => select(v.id)}>
        <View style={[styles.voiceIcon, v.gender === 'female' ? styles.voiceIconFemale : styles.voiceIconMale]}>
          <Mic size={18} color={v.gender === 'female' ? '#DB2777' : '#4F46E5'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.voiceName}>{v.name}</Text>
          <Text style={styles.voiceMeta}>{t('voicePicker.speaks', { language: languageName })}</Text>
        </View>
        <Pressable
          style={[styles.playChip, isPlaying && styles.playChipActive]}
          onPress={() => play(v.id)}
          accessibilityLabel={t('voicePicker.play')}
          hitSlop={6}
        >
          <Volume2 size={14} color={isPlaying ? colors.textOnPrimary : colors.primary} />
          <Text style={[styles.playChipText, isPlaying && styles.playChipTextActive]}>
            {isPlaying ? t('voicePicker.playing') : t('voicePicker.play')}
          </Text>
        </Pressable>
        <View style={[styles.checkBadge, isSelected && styles.checkBadgeOn]}>
          <Check size={12} color={isSelected ? colors.textOnPrimary : colors.textFaint} strokeWidth={3} />
        </View>
      </Card>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScreenHeader onBack={onClose} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t('voicePicker.title')}</Text>
          <Text style={styles.subtitle}>{t('voicePicker.subtitle')}</Text>

          <Text style={styles.sectionLabel}>{t('voicePicker.female')}</Text>
          {voices('female').map(renderVoice)}

          <Text style={styles.sectionLabel}>{t('voicePicker.male')}</Text>
          {voices('male').map(renderVoice)}

          <View style={styles.note}>
            <Text style={styles.noteText}>{t('voicePicker.previewNote', { language: languageName })}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton title={t('voicePicker.done')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** The voice name shown on the Profile settings row: the stored choice when
 * set, otherwise the name of the course-default voice actually in use. Falls
 * back to the raw voice id for backend-valid voices outside the picker's
 * catalog (e.g. 'sage'), so the row never renders empty. */
export function currentVoiceLabel(storedVoice: string, course: string): string {
  const effective = effectiveVoice(storedVoice, course);
  return tutorVoiceById(effective)?.name ?? effective;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.display,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    marginTop: 4,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sectionLabel: {
    ...typography.label,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.textMuted,
  },
  voiceRow: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  voiceRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  voiceIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  voiceIconFemale: {
    backgroundColor: '#FCE7F3',
  },
  voiceIconMale: {
    backgroundColor: '#E0E7FF',
  },
  voiceName: {
    ...typography.cardTitle,
    fontWeight: '700',
    color: colors.text,
  },
  voiceMeta: {
    ...typography.caption,
    marginTop: 1,
    color: colors.textMuted,
  },
  playChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  playChipActive: {
    backgroundColor: colors.primary,
  },
  playChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  playChipTextActive: {
    color: colors.textOnPrimary,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  checkBadgeOn: {
    backgroundColor: colors.primary,
  },
  note: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noteText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    padding: spacing.lg,
  },
});
