import React from 'react';
import { Modal } from 'react-native';
import { LanguagePickerScreen } from '../screens/LanguageSelectScreen';

/** Full-screen language picker reached from Profile settings — same content
 * as the pre-login picker (Login screen's language pill), just presented in
 * a Modal since the post-login tabs have no stack navigator to push onto. */
export function LanguagePickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <LanguagePickerScreen onDone={onClose} />
    </Modal>
  );
}
