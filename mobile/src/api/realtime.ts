import { apiRequest } from './client';

// The GA endpoint returns the ephemeral key at the top level, plus the
// canonical tutor instructions (so the app never embeds its own copy).
export type ClientSecretResponse = {
  value: string;
  expires_at: number;
  instructions?: string;
};

export function getRealtimeClientSecret() {
  return apiRequest<ClientSecretResponse>('/api/realtime/client-secret', {
    method: 'POST',
    auth: true,
  });
}
