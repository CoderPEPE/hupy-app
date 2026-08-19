import { API_BASE_URL } from '../config';
import { translate, useI18nStore } from '../i18n';
import { getSecureStorage, SecureKeys } from '../storage';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Attach the stored JWT as a Bearer token. */
  auth?: boolean;
};

/**
 * Upper bound for any single request. TTS generation can legitimately take
 * tens of seconds, so this is generous — but a hung server must not leave
 * the app spinning forever on a promise that never settles.
 */
const REQUEST_TIMEOUT_MS = 60_000;

function buildHeaders(auth: boolean): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getSecureStorage().getString(SecureKeys.authToken);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

async function doFetch(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, auth = false } = options;
  // Abort the request if the server never answers; the timeout is cleared on
  // every exit path so it can't fire after the request has settled.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: buildHeaders(auth),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, translate(useI18nStore.getState().locale, 'api.networkUnreachable'));
  } finally {
    clearTimeout(timer);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  const data = await res.json().catch(() => null);
  const message =
    (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : null) ?? translate(useI18nStore.getState().locale, 'api.requestFailed', { status: res.status });
  return new ApiError(res.status, message);
}

/**
 * Registered by the auth store so the client can end the session without
 * importing the store (which would be a circular dependency). Called only
 * when the refresh token itself is rejected — i.e. the session is truly dead.
 */
let sessionExpiredHandler: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

/** What a refresh attempt concluded. */
type RefreshOutcome = 'refreshed' | 'dead' | 'unreachable';

/**
 * One refresh in flight for the whole app. When several requests 401 at
 * once (parallel queries after the access token expired), they all await
 * this single call instead of each racing to rotate the refresh token —
 * rotation is single-use, so concurrent refreshes would revoke each other.
 */
let refreshInFlight: Promise<RefreshOutcome> | null = null;

// The session-expired handler must fire exactly once per dead session, even
// when many requests observe the same failed refresh. Reset when a fresh
// refresh attempt starts.
let expiredReported = false;

async function refreshAccessToken(): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    expiredReported = false;
    const refreshToken = getSecureStorage().getString(SecureKeys.refreshToken);
    if (!refreshToken) return 'dead';
    // Deliberately NOT routed through apiRequest: no auth header, and a 401
    // here must not trigger another refresh (infinite loop).
    let res: Response;
    try {
      res = await doFetch('/api/auth/refresh', {
        method: 'POST',
        body: { refresh_token: refreshToken },
      });
    } catch {
      // Network blip — the token wasn't rotated, the session is still alive.
      return 'unreachable';
    }
    // Only the server rejecting the credential itself means the session is
    // dead: 401 (token rejected, or its family revoked) and 400 (the stored
    // token is malformed). Everything else — 429 from the rate limiter, 5xx
    // from a database blip, the gateway's timeout — left the token
    // un-rotated server-side, so the session is still perfectly good and
    // treating it as dead would sign out a valid 30-day login on a bad
    // minute.
    if (res.status === 401 || res.status === 400) return 'dead';
    if (!res.ok) return 'unreachable';
    const data = await res.json().catch(() => null);
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as { token?: unknown }).token !== 'string' ||
      typeof (data as { refresh_token?: unknown }).refresh_token !== 'string'
    ) {
      return 'unreachable';
    }
    // Zombie-session guard: the user may have signed out (or signed in as
    // someone else) while the refresh was in flight. Only persist the fresh
    // pair if this refresh is still the current session's — otherwise a
    // signOut would be silently undone by a late-arriving refresh, and a
    // stale request could rotate the *new* account's refresh token.
    if (getSecureStorage().getString(SecureKeys.refreshToken) !== refreshToken) return 'unreachable';
    getSecureStorage().set(SecureKeys.authToken, (data as { token: string }).token);
    getSecureStorage().set(SecureKeys.refreshToken, (data as { refresh_token: string }).refresh_token);
    return 'refreshed';
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Signals a genuinely dead session, at most once per refresh attempt. */
function reportSessionExpired(): void {
  if (expiredReported) return;
  expiredReported = true;
  sessionExpiredHandler?.();
}

/**
 * Executes one request, transparently handling an expired access token: on a
 * 401 for an authenticated call, the stored refresh token is rotated once
 * (single-flight across concurrent callers) and the request retried. If the
 * refresh token is also rejected, the session is dead — the session-expired
 * handler (auth store) clears it once and the original 401 propagates. A
 * network failure during refresh keeps the session and surfaces as a network
 * error (status 0), never as a 401 (which would bounce the user to login on
 * a blip).
 */
async function runRequest<T>(
  path: string,
  options: RequestOptions,
  parse: (res: Response) => Promise<T>,
): Promise<T> {
  let res = await doFetch(path, options);
  if (res.status === 401 && options.auth) {
    const outcome = await refreshAccessToken();
    if (outcome === 'refreshed') {
      res = await doFetch(path, options);
      if (res.ok) return parse(res);
      if (res.status !== 401) throw await errorFrom(res);
      // Fresh access token but still 401 — the account itself is gone.
      reportSessionExpired();
    } else if (outcome === 'dead') {
      reportSessionExpired();
    } else {
      // Couldn't reach the refresh endpoint — keep the session, surface the
      // outage as a network error so callers retry rather than sign out.
      throw new ApiError(0, translate(useI18nStore.getState().locale, 'api.networkUnreachable'));
    }
  }
  if (!res.ok) throw await errorFrom(res);
  return parse(res);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return runRequest(path, options, async (res) => (await res.json().catch(() => null)) as T);
}

/** Like apiRequest but returns raw bytes (used for TTS audio). */
export async function apiArrayBuffer(
  path: string,
  options: RequestOptions = {},
): Promise<ArrayBuffer> {
  return runRequest(path, options, (res) => res.arrayBuffer());
}
