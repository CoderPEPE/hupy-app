import { Linking } from 'react-native';

/**
 * Opens an external URL, swallowing the failure.
 *
 * These are the Privacy Policy and Terms links: on a device with no browser
 * able to handle the URL, `openURL` rejects. That must not surface as an
 * unhandled rejection — the tap simply does nothing rather than crashing the
 * screen the learner is trying to sign up on.
 */
export async function openUrl(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // Nothing sensible to do: there is no browser to fall back to.
  }
}
