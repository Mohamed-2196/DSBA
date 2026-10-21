// Messages for what can go wrong while signing in, signing up or changing a password.
import { ApiError } from '../api/errors';

/** '45 seconds', '4 minutes', '2 hours'. */
export function waitText(seconds: number | null | undefined): string {
  const s = Math.max(1, Math.ceil(seconds ?? 60));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.ceil(m / 60);
  return `${h} hour${h === 1 ? '' : 's'}`;
}

// Used when the server sends no message of its own. Its messages are written for students and win.
const FALLBACK: Record<string, (e: ApiError) => string> = {
  rate_limited: (e) => `Too many tries. Try again in ${waitText(e.retryAfter)}.`,
  invalid_email: () => 'Enter a valid email address, like name@example.com.',
  invalid_credentials: () => 'This email address and password don’t match. Try again, or continue with Google.',
  wrong_password: () => 'That isn’t your current password. Try again.',
  weak_password: () => 'Choose a longer, less common password.',
  email_taken: () => 'An account already uses this email address. Sign in instead.',
  reset_link_invalid: () => 'This link has expired or was already used. Ask an admin for a new one.',
};

/** What went wrong, in a sentence fit to show. */
export function authErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Something went wrong. Try again.';
  switch (e.code) {
    case 'network':
      return 'Couldn’t reach the Hub. Check your connection and try again.';
    case 'internal':
      return 'Something went wrong on our side. Try again in a minute.';
    default: {
      const generic = !e.message || e.message === 'Request failed.';
      return (!generic && e.message) || FALLBACK[e.code]?.(e) || 'Something went wrong. Try again.';
    }
  }
}

/** The field a problem belongs under ('email', 'password', 'newPassword', 'currentPassword'), or null when it is the
 *  form's (no connection, a limit, the server). */
export function fieldOf(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  const named = Object.keys(e.fields)[0];
  if (named) return named;
  if (e.code === 'invalid_email' || e.code === 'email_taken') return 'email';
  return null;
}

// Where "Continue with Google" comes back with ?authError=<code> (the API's GoogleError).
const GOOGLE_ERRORS: Record<string, string> = {
  google_off: 'Continue with Google isn’t set up on this hub. Use your email address and password.',
  google_cancelled: 'You didn’t finish with Google, so nothing changed.',
  google_failed: 'Signing in with Google didn’t work. Try again.',
  google_unverified: 'Google hasn’t verified this Google account’s email address yet. Verify it with Google first.',
  google_taken: 'This Google account already signs in to another DSBA Hub account.',
  email_taken: 'Another DSBA Hub account already uses this Google account’s email address.',
};

/** The message for ?authError=<code>, or null for anything else. */
export function googleErrorMessage(code: string | null): string | null {
  return code ? (GOOGLE_ERRORS[code] ?? GOOGLE_ERRORS.google_failed ?? null) : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A light check before asking the server (which normalises and decides): what's wrong, or null. */
export function checkEmail(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Enter your email address.';
  return EMAIL.test(value) ? null : 'That email address doesn’t look right. Check it and try again.';
}

/** The API's minimum, checked before sending so the person sees it at once. */
export const PASSWORD_MIN = 8;

export function checkNewPassword(raw: string): string | null {
  if (!raw) return 'Choose a password.';
  return raw.length < PASSWORD_MIN
    ? `Use at least ${PASSWORD_MIN} characters. A few words together are easy to remember.`
    : null;
}
