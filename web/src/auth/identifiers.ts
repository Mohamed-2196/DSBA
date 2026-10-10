// Email or phone number? A light check before asking the server (which normalises and decides).
// Local Bahraini numbers need no country code: '3312 3456' is +973 3312 3456.

export type IdentifierKind = 'email' | 'phone';

export interface IdentifierCheck {
  kind: IdentifierKind | null;
  /** what is wrong, fit to show under the field; null when it looks fine */
  error: string | null;
  /** the number as we will text it ('+973 3312 3456'), for the hint */
  phone: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bahraini(digits: string): string {
  return `+973 ${digits.slice(0, 4)} ${digits.slice(4)}`;
}

export function checkIdentifier(raw: string): IdentifierCheck {
  const value = raw.trim();
  if (!value) return { kind: null, error: 'Enter your email address or phone number.', phone: null };
  if (value.includes('@')) {
    return EMAIL.test(value)
      ? { kind: 'email', error: null, phone: null }
      : { kind: 'email', error: 'That email address doesn’t look right. Check it and try again.', phone: null };
  }
  const compact = value.replace(/[\s().-]/g, '');
  if (!/^(\+|00)?\d+$/.test(compact)) return { kind: null, error: 'Enter an email address or a phone number.', phone: null };
  const international = /^(\+|00)/.test(compact);
  const digits = compact.replace(/^(\+|00)/, '');
  if (digits.length < 7 || digits.length > 15) {
    return { kind: 'phone', error: 'That number doesn’t look right. Bahraini numbers have 8 digits.', phone: null };
  }
  if (!international && digits.length === 8) return { kind: 'phone', error: null, phone: bahraini(digits) };
  if (digits.length === 11 && digits.startsWith('973')) return { kind: 'phone', error: null, phone: bahraini(digits.slice(3)) };
  return { kind: 'phone', error: null, phone: international ? `+${digits}` : null };
}

/** A stored phone number for people to read: '+97333123456' → '+973 3312 3456' (others as they are). */
export function formatPhone(e164: string): string {
  return /^\+973\d{8}$/.test(e164) ? `+973 ${e164.slice(4, 8)} ${e164.slice(8)}` : e164;
}

/** The hint under the identifier field. */
export function identifierHint(raw: string): string {
  const c = checkIdentifier(raw);
  if (c.kind === 'email' && !c.error) return 'We’ll email you a 6-digit code.';
  if (c.kind === 'phone' && !c.error) return c.phone ? `We’ll text a 6-digit code to ${c.phone}.` : 'We’ll text you a 6-digit code.';
  return 'We’ll send you a 6-digit code. No password needed.';
}
