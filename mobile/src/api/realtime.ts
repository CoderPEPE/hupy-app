import { apiRequest } from './client';

/** A Realtime function-tool definition, as sent to the model. */
export type RealtimeTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

// The GA endpoint returns the ephemeral key at the top level, plus the
// canonical tutor instructions and tool definitions (so the app never embeds
// its own copy — the pedagogical method and DB-backed context live on the
// server, rebuilt fresh from the learner's real progress every session).
export type ClientSecretResponse = {
  value: string;
  expires_at: number;
  instructions?: string;
  tools?: RealtimeTool[];
};

export function getRealtimeClientSecret() {
  return apiRequest<ClientSecretResponse>('/api/realtime/client-secret', {
    method: 'POST',
    auth: true,
  });
}
