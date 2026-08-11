/**
 * The tutor-voice catalog. The live list comes from the backend
 * (GET /api/voices, table `tutor_voices`); the copy below is the offline
 * fallback so the picker still renders if that request fails.
 *
 * It holds every voice usable by *both* the Realtime tutor and the TTS
 * previews. Voices the speech API alone offers (fable, nova, onyx) are
 * deliberately absent: picking one would break live sessions. Every voice can
 * speak all course languages, so the picker groups them by gender and
 * previews each one greeting the learner in their language.
 *
 * `pitchHz` is each voice's measured median fundamental frequency — it orders
 * every group bright -> deep and is the evidence behind the gender labels.
 */
export type TutorVoiceGender = 'female' | 'male';

export type TutorVoice = {
  /** OpenAI voice id — what gets stored on the user and sent to /api/tts. */
  id: string;
  /** Display name (the voice's actual name in OpenAI's lineup). */
  name: string;
  gender: TutorVoiceGender;
  /** Measured median F0 in Hz (server field name: `pitch_hz`). */
  pitch_hz: number;
};

export const TUTOR_VOICES: TutorVoice[] = [
  // Female — mirrors migrations/2026-08-11-000009_tutor_voices.
  { id: 'coral', name: 'Coral', gender: 'female', pitch_hz: 219 },
  { id: 'marin', name: 'Marin', gender: 'female', pitch_hz: 187 },
  { id: 'ballad', name: 'Ballad', gender: 'female', pitch_hz: 180 },
  { id: 'sage', name: 'Sage', gender: 'female', pitch_hz: 180 },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', pitch_hz: 150 },
  // Male
  { id: 'verse', name: 'Verse', gender: 'male', pitch_hz: 168 },
  { id: 'cedar', name: 'Cedar', gender: 'male', pitch_hz: 146 },
  { id: 'alloy', name: 'Alloy', gender: 'male', pitch_hz: 132 },
  { id: 'echo', name: 'Echo', gender: 'male', pitch_hz: 117 },
  { id: 'ash', name: 'Ash', gender: 'male', pitch_hz: 111 },
];

export const tutorVoiceById = (id: string): TutorVoice | undefined =>
  TUTOR_VOICES.find((v) => v.id === id);

/**
 * The greeting the preview play button speaks, in the learner's target
 * language — "Hello, my name is {name}, how are you?" localized per course.
 * `name` is the *tutor's* name (the voice being auditioned, e.g. "Marin"),
 * since the voice is introducing itself, not the learner.
 */
export function voiceGreeting(language: string, name: string): string {
  const who = name.trim();
  switch (language) {
    case 'es':
      return who ? `Hola, me llamo ${who}. ¿Cómo estás?` : 'Hola, ¿cómo estás?';
    case 'pt':
      return who ? `Olá, meu nome é ${who}. Como você está?` : 'Olá, como você está?';
    default:
      return who ? `Hello, my name is ${who}. How are you?` : 'Hello, how are you?';
  }
}
