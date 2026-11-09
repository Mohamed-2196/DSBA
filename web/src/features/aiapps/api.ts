// AI apps connected to the student's account through the Hub's MCP server, and the yes or no on /connect-ai.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ACCOUNT_KEY } from '../../api/keys';
import type { ConnectedApp } from '../../api/types';

export const AI_APPS_KEY = [...ACCOUNT_KEY, 'ai-apps'] as const;

/** The address a student pastes into their AI app: the Hub's own origin, where the MCP server answers. */
export function mcpAddress(origin: string = window.location.origin): string {
  return `${origin}/api/mcp`;
}

const SCRIPT_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'blob:', 'file:', 'about:']);

/**
 * Whether the page may send the student to the app's return address. The API only accepts safe ones; this is the
 * second lock, so an address that would run as script on the Hub is never opened.
 */
export function safeReturn(url: string): boolean {
  try {
    return !SCRIPT_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function useConnectedApps(enabled: boolean) {
  return useQuery({
    queryKey: AI_APPS_KEY,
    queryFn: () => call(api.GET('/api/v1/ai-apps')),
    enabled,
  });
}

export function useDisconnectApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/ai-apps/{connection_id}', { params: { path: { connection_id: id } } })),
    onSuccess: (_r, id) => {
      qc.setQueryData<ConnectedApp[]>(AI_APPS_KEY, (before) => before?.filter((a) => a.id !== id));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AI_APPS_KEY }),
  });
}

/** What the app asking wants, from the signed request it sent the student with. Never retried: a 422 is final. */
export function useConsentAsk(request: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...AI_APPS_KEY, 'consent', request],
    queryFn: () => call(api.GET('/api/v1/ai-apps/consent', { params: { query: { request: request ?? '' } } })),
    enabled: enabled && !!request,
    retry: false,
    staleTime: Infinity,
  });
}

export function useConsentAnswer() {
  return useMutation({
    mutationFn: (body: { request: string; allow: boolean }) => call(api.POST('/api/v1/ai-apps/consent', { body })),
  });
}
