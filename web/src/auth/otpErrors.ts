// Messages for what can go wrong while sending or checking a one-time code.
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

// Used when the server sends no message of its own. Its messages are written for students and win: they know
// which limit was hit ('Wait 45 seconds before asking for another code.') and how many tries are left.
const FALLBACK: Record<string, (e: ApiError) => string> = {
  rate_limited: (e) => `Too many codes requested. Try again in ${waitText(e.retryAfter)}.`,
  invalid_identifier: () => 'Enter a valid email address or phone number.',
  sms_unavailable: () => 'We can’t text this number. Use your email address instead.',
  delivery_failed: () => 'We couldn’t send the code. Try again in a minute, or use your other address.',
  invalid_code: () => 'That code isn’t right. Check it and try again.',
  code_expired: () => 'This code has expired. Ask for a new one.',
  too_many_attempts: () => 'Too many wrong tries for this code. Ask for a new one.',
  identifier_taken: () => 'Another account already uses this. Use a different one.',
};

/** What went wrong while sending or checking a code, in a sentence fit to show. */
export function otpErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Something went wrong. Try again.';
  switch (e.code) {
    case 'network':
      return 'Couldn’t reach the Hub. Check your connection and try again.';
    case 'internal':
      return 'Something went wrong on our side. Try again in a minute.';
    case 'not_implemented':
      return 'Signing in isn’t available yet. Try again later.';
    case 'invalid_input':
      if (e.fields.code) return 'Enter the 6-digit code from the message.';
      if (e.fields.identifier) return 'Enter your email address or phone number.';
      return e.message;
    default: {
      const generic = !e.message || e.message === 'Request failed.';
      return (!generic && e.message) || FALLBACK[e.code]?.(e) || e.message || 'Something went wrong. Try again.';
    }
  }
}
