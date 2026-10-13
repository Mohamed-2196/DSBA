// What the app does when the API says the session is over (401) or too old for an account or admin change (403
// step_up_required): ask the person, then send the request again, so the action they took carries on
// (UX review UX-1, decision D2). An openapi-fetch middleware; AuthProvider registers it with real hooks.
import type { Middleware } from 'openapi-fetch';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_HEADER = 'X-CSRF-Token';

/** Sign-in itself and the step-up flow answer 401 or 403 for their own reasons: never guard them. */
function exempt(request: Request): boolean {
  const path = new URL(request.url, 'https://hub.invalid').pathname;
  return path.startsWith('/api/v1/auth/') || path.startsWith('/api/v1/me/step-up');
}

async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json();
    if (typeof body !== 'object' || body === null || !('error' in body)) return null;
    const { error } = body;
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : null;
  } catch {
    return null;
  }
}

/** What the step-up dialog says the code is for. */
export function stepUpPurpose(request: Pick<Request, 'method' | 'url'>): string {
  const path = new URL(request.url, 'https://hub.invalid').pathname;
  if (request.method === 'DELETE' && path === '/api/v1/me') return 'delete your account';
  if (request.method === 'DELETE' && path.startsWith('/api/v1/me/identifiers/')) {
    return path.endsWith('/phone') ? 'remove your phone number' : 'remove your email address';
  }
  if (path.startsWith('/api/v1/me/identifiers')) return 'change how you sign in';
  if (path.startsWith('/api/v1/admin/roles')) return 'change roles';
  return 'make this change';
}

export interface SessionGuardHooks {
  /** Who the app shows as signed in: their id, or null for a guest (or while that isn't known yet). */
  currentUserId(): string | null;
  /** The API said the session is over while the app showed someone signed in: show a guest from now on.
   *  `write`: it happened on an action (the sign-in dialog follows) rather than on a read (say so quietly). */
  sessionEnded(info: { userId: string; write: boolean }): void;
  /** Ask the person to sign in. Resolves with who signed in, or null when they closed the dialog. */
  signIn(reason: string): Promise<string | null>;
  /** Ask for a code to an identifier the account already has. Resolves true once the session is renewed. */
  stepUp(purpose: string): Promise<boolean>;
  /** The CSRF token to send now: signing in and stepping up replace it. */
  csrfToken(): string | null;
  /** Send a request (window.fetch). */
  send(request: Request): Promise<Response>;
}

export const SIGNED_OUT_REASON = 'You were signed out. Sign in again to carry on.';

/**
 * 401 on an action: the session ended (signed out elsewhere, expired). Show a guest, open sign-in, and when the same
 * person signs in again (or a guest signs in), send the action again. Someone else signing in doesn't get the
 * previous person's action done in their name: the 401 stands.
 * 401 on a read: show a guest; nothing to resend.
 * 403 step_up_required on an action: ask for a step-up code, then send it again.
 * Whoever waits gets the original answer when the person gives up. One dialog serves every request waiting on it.
 */
export function createSessionGuard(hooks: SessionGuardHooks): Middleware {
  const copies = new WeakMap<Request, Request>();
  let signingIn: Promise<string | null> | null = null;
  let steppingUp: Promise<boolean> | null = null;

  const resend = (copy: Request): Promise<Response> => {
    const token = hooks.csrfToken();
    if (token) copy.headers.set(CSRF_HEADER, token);
    return hooks.send(copy);
  };

  return {
    onRequest({ request }) {
      // A body can be sent only once: keep an untouched copy of every action for one more try.
      if (UNSAFE.has(request.method) && !exempt(request)) copies.set(request, request.clone());
      return undefined;
    },
    async onResponse({ request, response }) {
      const copy = copies.get(request);
      copies.delete(request);
      if (exempt(request)) return undefined;

      if (response.status === 401) {
        const before = hooks.currentUserId();
        if (before) hooks.sessionEnded({ userId: before, write: !!copy });
        if (!copy) return undefined;
        signingIn ??= hooks.signIn(SIGNED_OUT_REASON).finally(() => {
          signingIn = null;
        });
        const who = await signingIn;
        if (!who || (before !== null && who !== before)) return undefined;
        return resend(copy);
      }

      if (response.status === 403 && copy && (await errorCode(response)) === 'step_up_required') {
        steppingUp ??= hooks.stepUp(stepUpPurpose(request)).finally(() => {
          steppingUp = null;
        });
        if (!(await steppingUp)) return undefined;
        return resend(copy);
      }
      return undefined;
    },
  };
}
