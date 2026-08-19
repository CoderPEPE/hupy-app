import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { API_BASE_URL } from '../config';

/**
 * Reachability of the hupy backend, from the app's point of view.
 *
 * The app is useless without its server (the tutor, the planets, the cards —
 * everything lives there), so "offline" here means "can't reach the
 * backend", not just "no cellular data". A server that's down, an airplane
 * mode, and a dead Wi-Fi all surface the same full-screen state, and all
 * recover automatically once `/health` answers again.
 */
export type ConnectivityStatus = 'checking' | 'online' | 'offline';

/** How long a single `/health` ping may take before it's aborted. */
export const HEALTH_TIMEOUT_MS = 6_000;
/** While online, a slow heartbeat keeps the check cheap. */
export const ONLINE_POLL_MS = 15_000;
/** While offline, poll faster so the screen clears itself when we're back. */
export const OFFLINE_POLL_MS = 5_000;
/** Consecutive failed probes before the app declares itself offline. Two at
 * OFFLINE_POLL_MS means a real outage still surfaces within a few seconds,
 * while a single slow response no longer kills an in-progress lesson. */
export const FAILURES_BEFORE_OFFLINE = 2;

/** One shot at `/health`. A timeout aborts instead of hanging on a dead route. */
export async function pingHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** A reachability probe; the real one hits `/health`, tests inject a scripted one. */
export type ConnectivityPing = () => Promise<boolean>;

export type ConnectivityMonitor = {
  /** Current status, readable synchronously (e.g. for tests). */
  getStatus: () => ConnectivityStatus;
  /** Starts the loop with an immediate check. */
  start: () => void;
  /** Forces an immediate re-check (the OfflineScreen's Try again button). */
  retry: () => void;
  /** Re-checks when the app returns to the foreground. */
  onAppStateChange: (state: string) => void;
  /** Stops the loop and ignores in-flight results. */
  dispose: () => void;
};

/**
 * The connectivity state machine, framework-free so it can be unit-tested
 * with a scripted ping and fake timers (see connectivity.test.ts).
 *
 * Rules:
 * - one check at a time — a stale ping must never overwrite a fresher result
 *   (overlaps can come from the poll timer firing while an AppState-triggered
 *   check is in flight, or a manual retry on top of either);
 * - after every result, exactly one timer is scheduled: slowly (ONLINE_POLL_MS)
 *   while online, faster (OFFLINE_POLL_MS) while offline so the offline
 *   screen clears itself as soon as the server is back.
 */
export function createConnectivityMonitor(options: {
  ping: ConnectivityPing;
  onChange: (status: ConnectivityStatus) => void;
}): ConnectivityMonitor {
  let status: ConnectivityStatus = 'checking';
  let inFlight = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Consecutive failed probes. One failure is not an outage: a cellular
   * handoff, a VPN reconnect or a cold Railway container routinely exceeds
   * HEALTH_TIMEOUT_MS, and flipping offline on the first miss tore down the
   * navigator mid-lesson. */
  let failures = 0;

  const check = async () => {
    if (inFlight || disposed) return;
    inFlight = true;
    const ok = await options.ping();
    inFlight = false;
    if (disposed) return;

    failures = ok ? 0 : failures + 1;
    // Online again on the first success; offline only once the server has
    // missed FAILURES_BEFORE_OFFLINE probes in a row.
    if (ok) {
      status = 'online';
    } else if (failures >= FAILURES_BEFORE_OFFLINE) {
      status = 'offline';
    }
    options.onChange(status);

    // One timer at a time — a manual or foreground-triggered check supersedes
    // any scheduled one instead of stacking a second poll loop.
    if (timer) clearTimeout(timer);
    // While failing but not yet declared offline, retry at the faster
    // cadence so a real outage is still noticed promptly.
    timer = setTimeout(() => void check(), ok ? ONLINE_POLL_MS : OFFLINE_POLL_MS);
  };

  return {
    getStatus: () => status,
    start: () => void check(),
    retry: () => {
      // The retry's 'checking' phase keeps the offline screen up with a
      // spinner until the new result arrives (App.tsx's ConnectivityGate).
      status = 'checking';
      failures = 0;
      options.onChange('checking');
      void check();
    },
    onAppStateChange: (state) => {
      if (state === 'active') void check();
    },
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
}

type Connectivity = {
  status: ConnectivityStatus;
  /** Forces an immediate re-check (the OfflineScreen's Try again button). */
  retry: () => void;
};

/**
 * Tracks backend reachability for the app's lifetime. Checks immediately on
 * mount, re-checks whenever the app returns to the foreground, and keeps a
 * timer going in the background — so the offline screen appears within
 * seconds of losing the server and dismisses itself as soon as it's back.
 *
 * A thin wrapper: all the behavior lives in the testable
 * `createConnectivityMonitor` engine.
 */
export function useConnectivity(): Connectivity {
  const [status, setStatus] = useState<ConnectivityStatus>('checking');
  const monitorRef = useRef<ConnectivityMonitor | null>(null);

  useEffect(() => {
    const monitor = createConnectivityMonitor({ ping: pingHealth, onChange: setStatus });
    monitorRef.current = monitor;
    monitor.start();
    const sub = AppState.addEventListener('change', (state) => monitor.onAppStateChange(state));
    return () => {
      sub.remove();
      monitor.dispose();
      monitorRef.current = null;
    };
  }, []);

  const retry = useCallback(() => monitorRef.current?.retry(), []);

  return { status, retry };
}
