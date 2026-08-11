import type { ConversationDetail, ConversationSummary, Correction, Message } from '../types';
import { apiRequest } from './client';

export function getConversations() {
  return apiRequest<ConversationSummary[]>('/api/conversations', { auth: true });
}

export function getConversation(id: string) {
  return apiRequest<ConversationDetail>(`/api/conversations/${id}`, { auth: true });
}

export function createConversation(input: { title?: string; planetId?: string }) {
  return apiRequest<ConversationSummary>('/api/conversations', {
    method: 'POST',
    auth: true,
    body: { title: input.title, planet_id: input.planetId },
  });
}

export function addConversationMessage(
  conversationId: string,
  input: { role: 'user' | 'assistant'; text: string; kind?: string },
) {
  return apiRequest<Message>(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    auth: true,
    body: input,
  });
}

export function addConversationCorrection(
  conversationId: string,
  input: {
    said: string;
    corrected: string;
    explanation: string;
    pt?: string;
    mistakePart?: string;
    subject?: string;
    verb?: string;
    complement?: string;
  },
) {
  return apiRequest<Correction>(`/api/conversations/${conversationId}/corrections`, {
    method: 'POST',
    auth: true,
    body: {
      said: input.said,
      corrected: input.corrected,
      explanation: input.explanation,
      pt: input.pt,
      mistake_part: input.mistakePart,
      subject: input.subject,
      verb: input.verb,
      complement: input.complement,
    },
  });
}
