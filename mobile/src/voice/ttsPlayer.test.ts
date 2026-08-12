import { effectiveVoice, ttsVoiceFor } from './ttsPlayer';

// ttsPlayer.ts pulls in react-native-audio-api (a native module that throws
// outside a device), so stub it before the import chain touches it. The
// helpers under test are pure and need no audio at all.
jest.mock('react-native-audio-api', () => ({
  AudioContext: class {},
  AudioBufferSourceNode: class {},
  AudioManager: { setAudioSessionOptions: jest.fn() },
}));
// The import chain also reaches storage (via api/tts -> client -> i18n);
// react-native-mmkv is stubbed globally in jest.setup.js.

describe('ttsVoiceFor', () => {
  it('mirrors the backend per-language Realtime voices', () => {
    expect(ttsVoiceFor('en')).toBe('marin');
    expect(ttsVoiceFor('es')).toBe('coral');
    expect(ttsVoiceFor('pt')).toBe('shimmer');
  });

  it('defaults unknown languages to the English voice', () => {
    expect(ttsVoiceFor('')).toBe('marin');
    expect(ttsVoiceFor('fr')).toBe('marin');
  });
});

describe('effectiveVoice', () => {
  it('prefers the stored voice', () => {
    expect(effectiveVoice('onyx', 'pt')).toBe('onyx');
  });

  it('falls back to the course default when nothing is stored', () => {
    expect(effectiveVoice('', 'es')).toBe('coral');
    expect(effectiveVoice('   ', 'pt')).toBe('shimmer');
  });
});
