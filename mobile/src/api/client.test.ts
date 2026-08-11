import { apiArrayBuffer, apiRequest } from './client';
import { storage, StorageKeys } from '../storage';

jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>();
  return {
    createMMKV: () => ({
      getString: (key: string) => store.get(key) ?? null,
      set: (key: string, value: string) => {
        store.set(key, value);
      },
      remove: (key: string) => {
        store.delete(key);
      },
    }),
  };
});

const jsonResponse = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('apiRequest', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('attaches the stored JWT when auth is requested', async () => {
    storage.set(StorageKeys.authToken, 'token-123');
    globalThis.fetch = jest.fn(async () => jsonResponse({ hello: 'world' }, 200)) as unknown as typeof fetch;

    const data = await apiRequest<{ hello: string }>('/api/planets', { auth: true });

    expect(data).toEqual({ hello: 'world' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/planets'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
    storage.remove(StorageKeys.authToken);
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
