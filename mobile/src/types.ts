export type User = {
  id: string;
  email: string;
  created_at: string;
  /** The learner's real name (set at registration); empty means screens
   * fall back to the email-derived name. */
  name: string;
  /** The learner's own language (how the tutor explains): 'en' | 'es' | 'pt'. */
  base_language: string;
  /** The language being learned: 'en' | 'es' | 'pt'. */
  language: string;
  /** Chosen tutor voice (OpenAI voice id); empty = the course default. */
  voice: string;
};

// ---------------------------------------------------------------------------
// Planets & lessons
// ---------------------------------------------------------------------------

export type PlanetStatus = 'active' | 'locked' | 'completed';

export type PlanetProgress = {
  sentences: number;
  pronunciation: number;
  conversation: number;
  listening: number;
  flashcards: number;
  review: number;
  mastery: number;
};

export type Planet = {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  color: string;
  topics: string[];
  created_at: string;
  /** The explanation language of this course: 'en' | 'es' | 'pt'. */
  base_language: 'en' | 'es' | 'pt';
  /** The taught (target) language: 'en' | 'es' | 'pt'. Sentence `en`
   * fields hold the target text, `pt` the base translation. */
  language: 'en' | 'es' | 'pt';
  status: PlanetStatus;
  /** 0..1 — how close this planet is to being unlocked (previous planet mastery). */
  unlock_progress: number;
  mastered_sentences: number;
  total_sentences: number;
  progress: PlanetProgress;
};

export type Sentence = {
  id: string;
  position: number;
  en: string;
  pt: string;
  subject: string;
  verb: string;
  complement: string;
  mastered: boolean;
};

export type PlanetDetail = Planet & {
  sentences: Sentence[];
  lessons: PlanetLesson[];
};

export type PlanetLessonKind = 'learn' | 'practice' | 'test' | 'master';

/** One step of the planet's lesson path (Learn -> Practice -> Test -> Master). */
export type PlanetLesson = {
  id: string;
  position: number;
  kind: PlanetLessonKind;
  title: string;
  description: string;
  completed: boolean;
  locked: boolean;
};

export type LessonStepKind = 'teach' | 'repeat' | 'question' | 'review' | 'praise' | 'correction';

export type LessonCorrection = {
  said: string;
  corrected: string;
  explanation: string;
  pt: string;
  mistake_part: string;
  subject: string;
  verb: string;
  complement: string;
};

export type LessonStep = {
  id: string;
  kind: LessonStepKind;
  tutor: string;
  expected?: string | null;
  mastery_gain?: number | null;
  correction?: LessonCorrection | null;
};

export type Lesson = {
  planet_id: string;
  steps: LessonStep[];
};

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

export type CardRating = 'hard' | 'medium' | 'easy';

export type Flashcard = {
  id: string;
  en: string;
  pt: string;
  explanation: string;
  subject: string;
  verb: string;
  complement: string;
  planet_id: string | null;
  correction_id: string | null;
  source: string;
  interval_days: number;
  ease: number;
  repetitions: number;
  next_review_at: string;
  created_at: string;
  /** true when the card is due for review right now */
  due: boolean;
  last_rating: CardRating | null;
  /** false when rated "easy" but the tutor hasn't re-tested it live yet */
  verified_live: boolean;
};

// ---------------------------------------------------------------------------
// Conversations, messages & corrections
// ---------------------------------------------------------------------------

export type ConversationSummary = {
  id: string;
  title: string;
  planet_id: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  kind: string;
  text: string;
  created_at: string;
};

export type Correction = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  said: string;
  corrected: string;
  explanation: string;
  pt: string;
  mistake_part: string;
  subject: string;
  verb: string;
  complement: string;
  created_at: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: Message[];
  corrections: Correction[];
};

// ---------------------------------------------------------------------------
// Chat UI shapes (built from the API data)
// ---------------------------------------------------------------------------

export type ChatMessage = {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  time: string;
  partial?: boolean;
  kind?: LessonStepKind;
  /** attached to tutor messages: a correction of what the user just said */
  correction?: LessonCorrection & { id?: string };
};
