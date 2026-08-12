import { API_BASE_URL } from '../config';
import {
  HEALTH_TIMEOUT_MS,
  OFFLINE_POLL_MS,
  ONLINE_POLL_MS,
  createConnectivityMonitor,
  pingHealth,
  type ConnectivityPing,
  type ConnectivityStatus,
} from './connectivity';

/**
 * The hook is a thin wrapper; the state machine is the pure
 * `createConnectivityMonitor` engine, tested here directly with a scripted
 * ping and fake timers — no React rendering needed (the codebase's testing
 * convention is pure logic, see gamification/celebrate.test.ts).
 */

const noop = () => {};

/** A ping whose outcome we control per call: each call takes the next scripted result, repeating the last. */
function scriptedPing(results: boolean[]): { ping: ConnectivityPing; calls: jest.Mock } {
  let index = 0;
  const calls = jest.fn(async () => results[Math.min(index++, results.length - 1)]);
  return { ping: calls as unknown as ConnectivityPing, calls };
}

/** Boots a monitor with the given ping and returns it plus a status recorder. */
function setup(results: boolean[]) {
  const { ping, calls } = scriptedPing(results);
  const seen: ConnectivityStatus[] = [];
  const monitor = createConnectivityMonitor({ ping, onChange: (s) => seen.push(s) });
  return { monitor, ping, calls, seen };
}

const flush = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createConnectivityMonitor — initial check & status transitions', () => {
  it('starts as checking and flips to online when the ping succeeds', async () => {
    const { monitor, seen } = setup([true]);
    expect(monitor.getStatus()).toBe('checking');
    monitor.start();
    await flush();
    expect(seen).toEqual(['online']);
    expect(monitor.getStatus()).toBe('online');
  });

  it('flips to offline when the ping fails', async () => {
    const { monitor, seen } = setup([false]);
    monitor.start();
    await flush();
    expect(seen).toEqual(['offline']);
  });

  it('reports the last result to every listener once', async () => {
    const { monitor, calls, seen } = setup([true]);
    monitor.start();
    await flush();
    expect(calls).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['online']);
    expect(monitor.getStatus()).toBe('online');
  });

  it('is idempotent against a start while an in-flight check is pending', async () => {
    // The ping never resolves until we let it; a second start must not start
    // a second concurrent ping.
    let resolve!: (v: boolean) => void;
    const ping: ConnectivityPing = jest.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const monitor = createConnectivityMonitor({ ping, onChange: noop });

    monitor.start();
    monitor.start();
    resolve(true);
    await flush();

    expect(ping).toHaveBeenCalledTimes(1);
    expect(monitor.getStatus()).toBe('online');
  });
});

describe('createConnectivityMonitor — polling', () => {
  it('polls again after ONLINE_POLL_MS while online, and each poll reports', async () => {
    const { monitor, calls, seen } = setup([true, true, true]);
    monitor.start();
    await flush();
    expect(calls).toHaveBeenCalledTimes(1);

    // Not yet due.
    await jest.advanceTimersByTimeAsync(ONLINE_POLL_MS - 1);
    expect(calls).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    await flush();
    expect(calls).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['online', 'online']);
  });

  it('polls faster (OFFLINE_POLL_MS) while offline, so recovery is snappy', async () => {
    const { monitor, calls } = setup([false, false, false, false]);
    monitor.start();
    await flush();
    expect(calls).toHaveBeenCalledTimes(1);

    // The offline loop fires every OFFLINE_POLL_MS, not the online cadence:
    // in the time ONE online poll would elapse, the offline loop has already
    // run three more times (5s, 10s, 15s).
    await jest.advanceTimersByTimeAsync(ONLINE_POLL_MS);
    await flush();
    expect(calls).toHaveBeenCalledTimes(4);
  });

  it('recovers to online after an offline streak when the server returns', async () => {
    const { monitor, seen } = setup([false, true]);
    monitor.start();
    await flush();
    expect(seen).toEqual(['offline']);

    await jest.advanceTimersByTimeAsync(OFFLINE_POLL_MS);
    await flush();
    expect(seen).toEqual(['offline', 'online']);
    expect(monitor.getStatus()).toBe('online');
  });
});

describe('createConnectivityMonitor — retry', () => {
  it('emits checking immediately, then the fresh result', async () => {
    const { monitor, seen } = setup([true, false]);
    monitor.start();
    await flush();
    expect(monitor.getStatus()).toBe('online');

    monitor.retry();
    // The checking phase is emitted synchronously so the offline screen's
    // spinner can show before the ping resolves.
    expect(monitor.getStatus()).toBe('checking');
    expect(seen).toEqual(['online', 'checking']);

    await flush();
    expect(seen).toEqual(['online', 'checking', 'offline']);
    expect(monitor.getStatus()).toBe('offline');
  });

  it('supersedes a scheduled poll instead of stacking a second timer', async () => {
    const { monitor, calls } = setup([true, true, true]);
    monitor.start();
    await flush();

    // Retry while the heartbeat timer is still pending — only one timer may
    // exist, so the next tick fires exactly one more ping.
    monitor.retry();
    await flush();
    expect(calls).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(ONLINE_POLL_MS + OFFLINE_POLL_MS);
    await flush();
    expect(calls).toHaveBeenCalledTimes(3);
  });
});

describe('createConnectivityMonitor — foreground recovery', () => {
  it('re-checks immediately when the app becomes active', async () => {
    const { monitor, calls, seen } = setup([true, true]);
    monitor.start();
    await flush();

    monitor.onAppStateChange('active');
    await flush();
    expect(calls).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['online', 'online']);
  });

  it('recovers from offline when the app is foregrounded', async () => {
    const { monitor, seen } = setup([false, true]);
    monitor.start();
    await flush();
    expect(seen).toEqual(['offline']);

    monitor.onAppStateChange('active');
    await flush();
    expect(seen).toEqual(['offline', 'online']);
  });

  it('ignores non-active app states', async () => {
    const { monitor, calls } = setup([true]);
    monitor.start();
    await flush();

    for (const state of ['background', 'inactive', 'extension']) {
      monitor.onAppStateChange(state);
    }
    await flush();
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('does not let an in-flight check overlap a foreground re-check', async () => {
    let resolve!: (v: boolean) => void;
    const ping: ConnectivityPing = jest.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const monitor = createConnectivityMonitor({ ping, onChange: noop });

    monitor.start(); // ping #1 in flight
    monitor.onAppStateChange('active'); // ignored — still in flight
    resolve(true);
    await flush();

    expect(ping).toHaveBeenCalledTimes(1);
  });
});

describe('createConnectivityMonitor — dispose', () => {
  it('stops the poll loop', async () => {
    const { monitor, calls } = setup([true]);
    monitor.start();
    await flush();

    monitor.dispose();
    await jest.advanceTimersByTimeAsync(ONLINE_POLL_MS * 3);
    await flush();
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('ignores a result that resolves after dispose', async () => {
    let resolve!: (v: boolean) => void;
    const ping: ConnectivityPing = jest.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const seen: ConnectivityStatus[] = [];
    const monitor = createConnectivityMonitor({ ping, onChange: (s) => seen.push(s) });

    monitor.start();
    monitor.dispose();
    resolve(false);
    await flush();

    expect(seen).toEqual([]);
    expect(monitor.getStatus()).toBe('checking');
  });
});

describe('pingHealth', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockFetch = (impl: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => {
    globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
  };

  const jsonResponse = (status: number) =>
    new Response('{}', { status, headers: { 'Content-Type': 'application/json' } });

  it('hits the health endpoint and reports ok', async () => {
    mockFetch(async (url) => {
      expect(String(url)).toBe(`${API_BASE_URL}/health`);
      return jsonResponse(200);
    });
    await expect(pingHealth()).resolves.toBe(true);
  });

  it('reports false on a non-ok status (server up, but unhealthy)', async () => {
    mockFetch(async () => jsonResponse(500));
    await expect(pingHealth()).resolves.toBe(false);
  });

  it('reports false when fetch rejects (no network)', async () => {
    mockFetch(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(pingHealth()).resolves.toBe(false);
  });

  it('aborts after HEALTH_TIMEOUT_MS instead of hanging', async () => {
    // A fetch that never settles unless aborted — mirrors a dead route.
    mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const result = pingHealth();
    await jest.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS);
    await expect(result).resolves.toBe(false);
  });
});
