/**
 * The curated tutor-voice catalog — a fixed subset of the OpenAI voices the
 * backend accepts (see KNOWN_VOICES in backend/src/api/auth.rs). Every voice
 * can speak all three course languages, so the picker groups them by gender
 * and previews each one saying the same greeting in the learner's language.
 */
export type TutorVoiceGender = 'female' | 'male';

export type TutorVoice = {
  /** OpenAI voice id — what gets stored on the user and sent to /api/tts. */
  id: string;
  /** Display name (the voice's actual name in OpenAI's lineup). */
  name: string;
  gender: TutorVoiceGender;
};

export const TUTOR_VOICES: TutorVoice[] = [
  // Female
  { id: 'marin', name: 'Marin', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female' },
  { id: 'coral', name: 'Coral', gender: 'female' },
  { id: 'nova', name: 'Nova', gender: 'female' },
  // Male
  { id: 'onyx', name: 'Onyx', gender: 'male' },
  { id: 'echo', name: 'Echo', gender: 'male' },
  { id: 'verse', name: 'Verse', gender: 'male' },
  { id: 'spruce', name: 'Spruce', gender: 'male' },
];

export const tutorVoiceById = (id: string): TutorVoice | undefined =>
  TUTOR_VOICES.find((v) => v.id === id);

/**
 * The greeting the preview play button speaks, in the learner's target
 * language — "Hello, my name is {name}, how are you?" localized per course.
 * The name is the same display name the tutor addresses the learner by
 * (the email's local part); when it's missing, the greeting omits it.
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
