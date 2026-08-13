import { apiRequest } from './client';

/** What the module gate looks like after the tutor closes a conversation. */
export type ModuleState = {
  lesson_id: string;
  state: 'locked' | 'current' | 'flashcards_pending' | 'completed';
  conversation_done: boolean;
  flashcards_done: boolean;
  flashcards_total: number;
  flashcards_reviewed: number;
  /** The module that opens once this one is fully finished. */
  next_lesson_id: string | null;
};

/** Closes a module's conversation — the tutor's `complete_module` tool call.
 * The module still needs its flashcards reviewed before the next one opens. */
export function completeModuleConversation(lessonId: string, weakStructures: string[] = []) {
  return apiRequest<ModuleState>(`/api/modules/${lessonId}/complete-conversation`, {
    method: 'POST',
    auth: true,
    body: { weak_structures: weakStructures },
  });
}

/** One structure's drill state, as the production endpoint reports it. */
export type StructureProgress = {
  target: string;
  base: string;
  productions: number;
  done: boolean;
};

/** What one `record_production` call changed, and the module's new state. */
export type ProductionResult = {
  lesson_id: string;
  target: string;
  productions: number;
  done_count: number;
  total_count: number;
  all_structures_done: boolean;
  conversation_done: boolean;
  flashcards_done: boolean;
  structures: StructureProgress[];
};

/** Logs one correct production of the current module's structure — the
 * tutor's `record_production` tool call. This is what makes module progress
 * deterministic: the module's conversation closes automatically once every
 * structure reaches its required productions. */
export function recordProduction(lessonId: string, target: string) {
  return apiRequest<ProductionResult>(`/api/modules/${lessonId}/production`, {
    method: 'POST',
    auth: true,
    body: { target },
  });
}
