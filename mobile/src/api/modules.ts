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
