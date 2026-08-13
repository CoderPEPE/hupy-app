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

/** The spec's six planet states (§6 "Estados do planeta"). */
export type PlanetStatus =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'review'
  | 'conquered'
  | 'mastered';

/** States that mean the planet is behind the learner. */
export function isPlanetFinished(status: PlanetStatus): boolean {
  return status === 'conquered' || status === 'mastered';
}

/** The one planet the learner should be working on right now. */
export function currentPlanet<T extends { status: PlanetStatus }>(planets: T[]): T | undefined {
  return planets.find((p) => !isPlanetFinished(p.status) && p.status !== 'locked') ?? planets[0];
}

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
  /** CEFR band of the planet: 'A1' | 'A2' | 'B1' | 'B2' | 'B2+' | 'C1'. */
  level: string;
  /** The planet's communication goal. */
  goal: string;
  /** Blocks completed so far (0..=10) — derived from mastery server-side. */
  completed_blocks: number;
  /** Total blocks on the planet (10). */
  total_blocks: number;
  /** Essential skills below 60% — what a pending review targets. Empty when
   * the planet has nothing to revisit. */
  review_skills: string[];
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

/** The standard 10-block path every planet follows (spec: "Estrutura padrão
 * dos 10 blocos"). */
export type PlanetLessonKind =
  | 'context'
  | 'vocabulary'
  | 'phrases'
  | 'structure'
  | 'listening'
  | 'pronunciation'
  | 'recall'
  | 'variations'
  | 'conversation'
  | 'mission';

/** A module's place in the learning cycle. A module is only finished once the
 * conversation AND its flashcards are done — `flashcards_pending` is the gap
 * between the two, where the next module stays shut. */
export type BlockState = 'locked' | 'current' | 'flashcards_pending' | 'completed';

/** One chunk a module teaches: a whole spoken sentence, never a bare word. */
export type Structure = {
  target: string;
  base: string;
  /** How many times the learner has produced it correctly in the current
   * module conversation — the checkpoint that survives app restarts. */
  productions: number;
  /** True once `productions` reaches the module's requirement (3). */
  done: boolean;
};

/** One module of the planet's ten-module path. */
export type PlanetLesson = {
  id: string;
  position: number;
  kind: PlanetLessonKind;
  title: string;
  description: string;
  state: BlockState;
  /** The progress metric this block trains — what its review would drill. */
  skill: string;
  /** What this module drills: `focus:have`, `mix`, `past`, `questions`, … */
  focus: string;
  /** The chunks taught here. */
  structures: Structure[];
  /** The module's own flashcards: the second half of the gate. */
  flashcards_total: number;
  flashcards_reviewed: number;
};

/** A module the learner has fully finished — conversation and flashcards. */
export function isBlockDone(state: BlockState): boolean {
  return state === 'completed';
}

/** The module the learner is on: the first one still unfinished, whether it
 * needs the conversation or only its flashcards. */
export function nextBlock(blocks: PlanetLesson[]): PlanetLesson | null {
  return blocks.find((b) => b.state === 'current' || b.state === 'flashcards_pending') ?? null;
}

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
// Personalized audio stories (one per conquered planet)
// ---------------------------------------------------------------------------

export type PlanetStory = {
  id: string;
  title: string;
  status: string;
  /** Ordered transcript units in the target language. */
  sentences: string[];
  /** 1:1 base-language translation per unit ('' where unavailable). */
  translation: string[];
  duration_secs: number;
  position_secs: number;
  completed: boolean;
  created_at: string;
  updated_at: string;
};

/** One row of the story library: a course planet + its story state. */
export type StoryListEntry = {
  planet: {
    id: string;
    number: number;
    title: string;
    color: string;
    level: string;
    goal: string;
  };
  /** True once the planet is conquered (or its story already exists). */
  unlocked: boolean;
  story: PlanetStory | null;
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
  /** The module whose conversation produced this card — reviewing the whole
   * set is what opens the next module. */
  lesson_id: string | null;
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
