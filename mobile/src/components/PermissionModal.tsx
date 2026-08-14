import { Mic, X } from 'lucide-react-native';
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../i18n';
import { colors, radius, shadows, spacing } from '../theme';

/** One-time primer shown before the OS microphone permission dialog — explains
 * why hupy needs the mic, matching the reference "Sua vez de falar!" modal.
 * Both buttons lead to the same real permission flow (this app's audio
 * pipeline doesn't have separately toggleable mic vs. speech-recognition
 * permissions), kept as two buttons to match the reference's layout. */
export function PermissionModal({
  visible,
  onDismiss,
  onContinue,
}: {
  visible: boolean;
  onDismiss: () => void;
  onContinue: () => void;
}) {
  const t = useT();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Pressable style={styles.closeBtn} onPress={onDismiss} hitSlop={8} accessibilityLabel={t('common.close')}>
            <X size={16} color={colors.textMuted} />
          </Pressable>

          <View style={styles.avatarWrap}>
            <Image
              source={require('../../assets/brand/mascot-astronaut.png')}
              style={styles.avatarImg}
              resizeMode="cover"
            />
            <View style={styles.micBadge}>
              <Mic size={14} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.title}>{t('permissionModal.title')}</Text>
          <Text style={styles.body}>{t('permissionModal.body')}</Text>

          <Pressable style={styles.button} onPress={onContinue}>
            <Text style={styles.buttonText}>{t('permissionModal.unlockMic')}</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={onContinue}>
            <Text style={styles.buttonText}>{t('permissionModal.unlockSpeech')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15,14,35,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 44,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: {
    position: 'absolute',
    top: -36,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.authBackground,
    borderWidth: 4,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.card,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  micBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.md,
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
});
