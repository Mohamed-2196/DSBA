import { QueryClient, onlineManager } from '@tanstack/react-query';
import { ApiError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // client errors (4xx) are answers, not glitches: don't retry them
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
    // Offline, a write fails at once with the connection message and the person's text stays where it is. Paused
    // until the connection is back, it would spin with no word and then post by itself, maybe after a reload.
    mutations: { retry: false, networkMode: 'always' },
  },
});

// TanStack Query assumes a connection until the browser says otherwise: start from what the browser knows, so a page
// opened offline waits for the connection (showing what was kept, api/offline.ts) instead of failing every request.
if (typeof navigator !== 'undefined' && navigator.onLine === false) onlineManager.setOnline(false);
