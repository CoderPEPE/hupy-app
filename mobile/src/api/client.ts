import { API_BASE_URL } from '../config';
import { translate, useI18nStore } from '../i18n';
import { storage, StorageKeys } from '../storage';

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

function buildHeaders(auth: boolean): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = storage.getString(StorageKeys.authToken);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

async function doFetch(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, auth = false } = options;
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: buildHeaders(auth),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, translate(useI18nStore.getState().locale, 'api.networkUnreachable'));
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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await doFetch(path, options);
  if (!res.ok) throw await errorFrom(res);
  return (await res.json().catch(() => null)) as T;
}

/** Like apiRequest but returns raw bytes (used for TTS audio). */
export async function apiArrayBuffer(
  path: string,
  options: RequestOptions = {},
): Promise<ArrayBuffer> {
  const res = await doFetch(path, options);
  if (!res.ok) throw await errorFrom(res);
  return res.arrayBuffer();
}
