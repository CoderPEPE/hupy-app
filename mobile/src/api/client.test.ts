// react-native-mmkv / expo-secure-store / expo-crypto are stubbed globally in
// jest.setup.js; the credentials live in the encrypted store, so each suite
// boots it first.
import { apiArrayBuffer, apiRequest, setSessionExpiredHandler } from './client';
import { getSecureStorage, initSecureStorage, SecureKeys } from '../storage';

const jsonResponse = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('apiRequest', () => {
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    await initSecureStorage();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('attaches the stored JWT when auth is requested', async () => {
    getSecureStorage().set(SecureKeys.authToken, 'token-123');
    globalThis.fetch = jest.fn(async () => jsonResponse({ hello: 'world' }, 200)) as unknown as typeof fetch;

    const data = await apiRequest<{ hello: string }>('/api/planets', { auth: true });

    expect(data).toEqual({ hello: 'world' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/planets'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
    getSecureStorage().remove(SecureKeys.authToken);
  });

  it('does not attach an auth header when auth is false', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse({}, 200)) as unknown as typeof fetch;
    await apiRequest('/api/login', { method: 'POST', body: { email: 'a@b.c' } });
    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('throws ApiError with the server message on non-2xx', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse({ error: 'Email already registered' }, 409)) as unknown as typeof fetch;
    await expect(apiRequest('/api/auth/register')).rejects.toMatchObject({
      status: 409,
      message: 'Email already registered',
    });
  });

  it('throws ApiError with status 0 when the network fails', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(apiRequest('/api/planets')).rejects.toMatchObject({ status: 0 });
  });

  it('serializes the JSON body', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse({}, 200)) as unknown as typeof fetch;
    await apiRequest('/api/tts', { method: 'POST', body: { text: 'hi', speed: 0.9 } });
    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ text: 'hi', speed: 0.9 }));
  });
});

describe('401 refresh interceptor', () => {
  const originalFetch = globalThis.fetch;
  const handler = jest.fn();

  beforeAll(async () => {
    await initSecureStorage();
  });

  beforeEach(() => {
    handler.mockClear();
    setSessionExpiredHandler(handler);
    getSecureStorage().set(SecureKeys.authToken, 'access-1');
    getSecureStorage().set(SecureKeys.refreshToken, 'refresh-1');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setSessionExpiredHandler(null);
    getSecureStorage().remove(SecureKeys.authToken);
    getSecureStorage().remove(SecureKeys.refreshToken);
  });

  it('rotates the refresh token and retries a 401 request', async () => {
    const refresh = jest.fn(async () =>
      jsonResponse({ token: 'access-2', refresh_token: 'refresh-2' }, 200),
    );
    // First /me call 401s (expired access token), the retried one succeeds.
    let meCalls = 0;
    const me = jest.fn(async () => {
      meCalls += 1;
      return jsonResponse({ id: 'u1' }, meCalls === 1 ? 401 : 200);
    });
    globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/api/auth/refresh')) return refresh();
      return me();
    }) as unknown as typeof fetch;

    const data = await apiRequest<{ id: string }>('/api/auth/me', { auth: true });

    expect(data).toEqual({ id: 'u1' });
    expect(getSecureStorage().getString(SecureKeys.authToken)).toBe('access-2');
    expect(getSecureStorage().getString(SecureKeys.refreshToken)).toBe('refresh-2');
    // The refresh call itself carries no Authorization header.
    const refreshCall = (globalThis.fetch as jest.Mock).mock.calls.find(([u]) =>
      String(u).endsWith('/api/auth/refresh'),
    ) as [string, RequestInit];
    expect(refreshCall[1].headers).not.toHaveProperty('Authorization');
    // The retried request uses the rotated access token (last /me call).
    const meRequests = (globalThis.fetch as jest.Mock).mock.calls.filter(([u]) =>
      String(u).endsWith('/api/auth/me'),
    ) as [string, RequestInit][];
    expect(meRequests).toHaveLength(2);
    expect(meRequests[0][1].headers).toMatchObject({ Authorization: 'Bearer access-1' });
    expect(meRequests[1][1].headers).toMatchObject({ Authorization: 'Bearer access-2' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('single-flights concurrent 401s behind one refresh call', async () => {
    const refresh = jest.fn(async () =>
      jsonResponse({ token: 'access-2', refresh_token: 'refresh-2' }, 200),
    );
    // First wave 401s; anything after the refresh has happened succeeds.
    let refreshed = false;
    globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/api/auth/refresh')) {
        refreshed = true;
        return refresh();
      }
      return jsonResponse({ ok: true }, refreshed ? 200 : 401);
    }) as unknown as typeof fetch;

    const results = await Promise.allSettled([
      apiRequest('/api/planets', { auth: true }),
      apiRequest('/api/flashcards', { auth: true }),
      apiRequest('/api/gamification/stats', { auth: true }),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    // All three retries succeed against the post-refresh world.
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('ends the session when the refresh token is rejected', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/api/auth/refresh')) return jsonResponse({ error: 'Invalid refresh token' }, 401);
      return jsonResponse({ error: 'expired' }, 401);
    }) as unknown as typeof fetch;

    await expect(apiRequest('/api/planets', { auth: true })).rejects.toMatchObject({ status: 401 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires the session-expired handler once when many requests share one dead refresh', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/api/auth/refresh')) return jsonResponse({ error: 'Invalid refresh token' }, 401);
      return jsonResponse({ error: 'expired' }, 401);
    }) as unknown as typeof fetch;

    await Promise.allSettled([
      apiRequest('/api/planets', { auth: true }),
      apiRequest('/api/flashcards', { auth: true }),
      apiRequest('/api/gamification/stats', { auth: true }),
    ]);

    // One refresh attempt, one session-death signal — the caller (auth
    // store) signs out exactly once instead of racing three clears.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('never resurrects a session the user signed out of mid-refresh', async () => {
    let refreshStarted: (r: Response) => void = () => {};
    let started = false;
    globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/api/auth/refresh')) {
        started = true;
        // Hold the refresh open while the user signs out below.
        return new Promise<Response>((resolve) => {
          refreshStarted = resolve;
        });
      }
      return jsonResponse({ error: 'expired' }, 401);
    }) as unknown as typeof fetch;

    const pending = apiRequest('/api/planets', { auth: true });
    // Wait until the refresh call is actually in flight (its token was read
    // into the closure) before signing out — only then is the race real.
    while (!started) {
      await new Promise((r) => setTimeout(r, 0));
    }
    getSecureStorage().remove(SecureKeys.authToken);
    getSecureStorage().remove(SecureKeys.refreshToken);
    refreshStarted(jsonResponse({ token: 'zombie-access', refresh_token: 'zombie-refresh' }, 200));

    await expect(pending).rejects.toMatchObject({ status: 0 });
    // The fresh pair must NOT be persisted over the cleared session.
    expect(getSecureStorage().getString(SecureKeys.authToken)).toBeNull();
    expect(getSecureStorage().getString(SecureKeys.refreshToken)).toBeNull();
    // And the session must not be reported dead on top of the signOut.
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps the session when the refresh call fails on the network', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/api/auth/refresh')) throw new TypeError('Network request failed');
      return jsonResponse({ error: 'expired' }, 401);
    }) as unknown as typeof fetch;

    // The 401 is replaced by a network error — the session is NOT declared
    // dead on a blip; the user keeps the session and retries later.
    await expect(apiRequest('/api/planets', { auth: true })).rejects.toMatchObject({ status: 0 });
    expect(handler).not.toHaveBeenCalled();
    expect(getSecureStorage().getString(SecureKeys.refreshToken)).toBe('refresh-1');
  });

  it('leaves the session alone when a non-auth request 401s', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse({ error: 'no' }, 401)) as unknown as typeof fetch;
    await expect(apiRequest('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' } })).rejects.toMatchObject({
      status: 401,
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('apiArrayBuffer', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns raw bytes for binary endpoints', async () => {
    globalThis.fetch = jest.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const buf = await apiArrayBuffer('/api/tts', { method: 'POST' });
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('still maps errors to ApiError', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse({ error: 'text too long' }, 400)) as unknown as typeof fetch;
    await expect(apiArrayBuffer('/api/tts')).rejects.toMatchObject({ status: 400 });
  });
});
