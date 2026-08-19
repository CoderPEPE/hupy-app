import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bumpPlanetProgress,
  getCatalogStats,
  getPlanet,
  getPlanetLesson,
  getPlanets,
  masterSentence,
  type ProgressMetric,
} from './planets';
import {
  confirmFlashcardMastery,
  correctionToCard,
  createFlashcard,
  getFlashcards,
  reviewFlashcard,
  type FlashcardFilters,
} from './flashcards';
import {
  addConversationCorrection,
  addConversationMessage,
  createConversation,
  getConversation,
  getConversations,
} from './conversations';
import { getGamificationStats } from './gamification';
import { completeModuleConversation, recordProduction } from './modules';
import { getStories, getStory, saveStoryProgress } from './stories';
import { getVoices } from './voices';
import { storage, StorageKeys } from '../storage';
import type { CardRating } from '../types';

export const queryKeys = {
  planets: ['planets'] as const,
  planet: (id: string) => ['planets', id] as const,
  lesson: (id: string) => ['planets', id, 'lesson'] as const,
  flashcards: (filters: FlashcardFilters = {}) =>
    ['flashcards', filters.planetId ?? 'all', filters.due ? 'due' : 'all-cards'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', id] as const,
  gamification: ['gamification'] as const,
  catalog: ['catalog'] as const,
  voices: ['voices'] as const,
  stories: ['stories'] as const,
};

/** Real course-content counts for the selected course, used by the pre-login
 * screens. The course is the (base, target) pair from the language picker
 * (defaults: Portuguese base, English target). */
export function useCatalogStats() {
  const baseLanguage = storage.getString(StorageKeys.baseLanguage) ?? 'pt';
  const language = storage.getString(StorageKeys.targetLanguage) ?? 'en';
  return useQuery({
    queryKey: [...queryKeys.catalog, baseLanguage, language],
    queryFn: () => getCatalogStats(baseLanguage, language),
  });
}

export function useGamificationStats() {
  return useQuery({ queryKey: queryKeys.gamification, queryFn: getGamificationStats });
}

/** The tutor voice catalog from the backend. It changes about never, so it is
 * fetched once per app run and reused. */
export function useTutorVoices() {
  return useQuery({ queryKey: queryKeys.voices, queryFn: getVoices, staleTime: Infinity });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePlanets() {
  return useQuery({ queryKey: queryKeys.planets, queryFn: getPlanets });
}

export function usePlanet(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.planet(id ?? ''),
    queryFn: () => getPlanet(id!),
    enabled: !!id,
  });
}

export function useLesson(planetId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.lesson(planetId ?? ''),
    queryFn: () => getPlanetLesson(planetId!),
    enabled: !!planetId,
  });
}

export function useFlashcards(filters: FlashcardFilters = {}) {
  return useQuery({ queryKey: queryKeys.flashcards(filters), queryFn: () => getFlashcards(filters) });
}

export function useConversations() {
  return useQuery({ queryKey: queryKeys.conversations, queryFn: getConversations });
}

/** The story library. A story the AI is still writing arrives as
 * `status: 'generating'`, so the list polls until every story is ready
 * rather than leaving the learner staring at a spinner that never resolves. */
/** One planet's story *with its transcript*. The library list deliberately
 * omits transcripts, so the player fetches the story it is about to play. */
export function useStory(planetId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.stories, planetId],
    queryFn: () => getStory(planetId as string),
    enabled: Boolean(planetId),
  });
}

export function useStories() {
  return useQuery({
    queryKey: queryKeys.stories,
    queryFn: getStories,
    refetchInterval: (query) =>
      query.state.data?.some((e) => e.story?.status === 'generating') ? 4000 : false,
  });
}

export function useConversation(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conversation(id ?? ''),
    queryFn: () => getConversation(id!),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useBumpProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planetId, metric, delta }: { planetId: string; metric: ProgressMetric; delta: number }) =>
      bumpPlanetProgress(planetId, metric, delta),
    onSuccess: (planet) => {
      // Only merge into the detail cache if it was already fetched — never
      // create a partial entry (a Planet summary without `sentences`) that
      // could be served before the detail query ever runs.
      const existing = qc.getQueryData(queryKeys.planet(planet.id));
      if (existing) {
        qc.setQueryData(queryKeys.planet(planet.id), { ...(existing as object), ...planet });
        // Lessons' completed/locked flags derive from mastery — refresh them.
        qc.invalidateQueries({ queryKey: queryKeys.planet(planet.id) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.planets });
      qc.invalidateQueries({ queryKey: queryKeys.gamification });
    },
  });
}

export function useMasterSentence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planetId, sentenceId, mastered }: { planetId: string; sentenceId: string; mastered: boolean }) =>
      masterSentence(planetId, sentenceId, mastered),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.planets });
      qc.invalidateQueries({ queryKey: queryKeys.gamification });
    },
  });
}

/** Closes the current module's conversation (the tutor's `complete_module`).
 * Refreshes the planet so the module list shows the new gate immediately. */
export function useCompleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, weakStructures }: { lessonId: string; weakStructures?: string[] }) =>
      completeModuleConversation(lessonId, weakStructures ?? []),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.planets });
      qc.invalidateQueries({ queryKey: ['flashcards'] });
      qc.invalidateQueries({ queryKey: queryKeys.stories });
    },
  });
}

/** Logs one correct production of a module structure (the tutor's
 * `record_production` tool call). Refreshes the planet so the chat's
 * progress bar advances and the module list reflects the new gate. */
export function useRecordProduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, target }: { lessonId: string; target: string }) =>
      recordProduction(lessonId, target),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.planets });
      qc.invalidateQueries({ queryKey: queryKeys.gamification });
    },
  });
}

/** Persists playback position.
 *
 * The library list is only invalidated when a story *finishes*, because that
 * is the one thing on it that changes. Invalidating on every save refetched
 * the whole library once per sentence — roughly 245 round trips per
 * playthrough — while the position it was fetching is already local state. */
export function useSaveStoryProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planetId, positionSecs, completed }: { planetId: string; positionSecs: number; completed?: boolean }) =>
      saveStoryProgress(planetId, positionSecs, completed),
    onSuccess: (_data, variables) => {
      if (variables.completed) {
        qc.invalidateQueries({ queryKey: queryKeys.stories });
      }
    },
  });
}

export function useReviewFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: CardRating }) => reviewFlashcard(id, rating),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards'] });
      qc.invalidateQueries({ queryKey: queryKeys.gamification });
    },
  });
}

export function useCreateFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createFlashcard,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards'] });
    },
  });
}

export function useCorrectionToCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (correctionId: string) => correctionToCard(correctionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards'] });
    },
  });
}

export function useConfirmFlashcardMastery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => confirmFlashcardMastery(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards'] });
      qc.invalidateQueries({ queryKey: queryKeys.planets });
    },
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createConversation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useAddMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      conversationId: string;
      role: 'user' | 'assistant';
      text: string;
      kind?: string;
    }) => addConversationMessage(input.conversationId, input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.conversation(variables.conversationId) });
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useAddCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string } & Parameters<typeof addConversationCorrection>[1]) => {
      const { conversationId, ...fields } = input;
      return addConversationCorrection(conversationId, fields);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.conversation(variables.conversationId) });
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
      qc.invalidateQueries({ queryKey: queryKeys.gamification });
    },
  });
}
