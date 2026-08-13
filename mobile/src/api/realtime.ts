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
  /** The tutor voice this session was minted with: the learner's pick, or the
   * course default. The app must echo it back in its own `session.update`,
   * which would otherwise override it. */
  voice?: string;
};

/** Which tutor session to mint: `generic` = a free conversation with no
 * planet scope; `lesson` (or omitting the opts entirely) = the planet-scoped
 * tutor session. */
export type RealtimeSessionMode = 'generic' | 'lesson';

/**
 * Mints a short-lived Realtime client secret. With no opts the request has
 * no body and the backend builds the planet-scoped session (its historical
 * behavior) — only a generic chat passes `mode: 'generic'`.
 */
export function getRealtimeClientSecret(opts?: { mode?: RealtimeSessionMode; planetId?: string }) {
  const body: Record<string, unknown> = {};
  if (opts?.mode) body.mode = opts.mode;
  if (opts?.planetId) body.planet_id = opts.planetId;
  return apiRequest<ClientSecretResponse>('/api/realtime/client-secret', {
    method: 'POST',
    auth: true,
    ...(Object.keys(body).length > 0 ? { body } : {}),
  });
}
