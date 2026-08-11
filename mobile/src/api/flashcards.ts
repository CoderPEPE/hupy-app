import type { CardRating, Flashcard } from '../types';
import { apiRequest } from './client';

export type FlashcardFilters = {
  planetId?: string;
  /** when true, only cards due now are returned */
  due?: boolean;
};

export function getFlashcards(filters: FlashcardFilters = {}) {
  const params = new URLSearchParams();
  if (filters.planetId) params.set('planet_id', filters.planetId);
  if (filters.due) params.set('due', 'true');
  const qs = params.toString();
  return apiRequest<Flashcard[]>(`/api/flashcards${qs ? `?${qs}` : ''}`, { auth: true });
}

export function createFlashcard(input: {
  en: string;
  pt: string;
  explanation?: string;
  subject?: string;
  verb?: string;
  complement?: string;
  planetId?: string;
}) {
  return apiRequest<Flashcard>('/api/flashcards', {
    method: 'POST',
    auth: true,
    body: {
      en: input.en,
      pt: input.pt,
      explanation: input.explanation,
      subject: input.subject,
      verb: input.verb,
      complement: input.complement,
      planet_id: input.planetId,
    },
  });
}

/** Records a review; the server reschedules the card (SRS) and returns it. */
export function reviewFlashcard(id: string, rating: CardRating) {
  return apiRequest<Flashcard>(`/api/flashcards/${id}/review`, {
    method: 'POST',
    auth: true,
    body: { rating },
  });
}

/** Turns a saved correction into a flashcard ("Make a card"). */
export function correctionToCard(correctionId: string) {
  return apiRequest<Flashcard>(`/api/flashcards/corrections/${correctionId}/flashcard`, {
    method: 'POST',
    auth: true,
  });
}
