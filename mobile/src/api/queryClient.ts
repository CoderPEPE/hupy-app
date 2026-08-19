import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

/**
 * The app's single React Query client.
 *
 * It lives here rather than in `App.tsx` so the auth store can reach it: the
 * cache is keyed per query, not per user, so it must be emptied at every auth
 * boundary or the next account signed in on the device is served the previous
 * one's planets, conversations and stats until each query happens to refetch.
 */

/** Registered by the auth store; called when a query sees a dead session. */
let unauthorizedHandler: (() => void) | null = null;

/** Lets the auth store react to a 401 without this module importing it back. */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // A 401 mid-session means the JWT expired or was revoked — end the
      // session so the app returns to the login screen instead of erroring.
      if (error instanceof ApiError && error.status === 401) {
        unauthorizedHandler?.();
      }
    },
  }),
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000 },
  },
});

/**
 * Drops every cached response. Called on sign-in, sign-out and account
 * deletion — anywhere the identity behind the cache changes.
 *
 * `clear()` rather than `invalidateQueries()`: invalidation keeps the stale
 * data readable while it refetches, which is exactly the leak we are closing.
 */
export function resetQueryCache(): void {
  queryClient.clear();
}
