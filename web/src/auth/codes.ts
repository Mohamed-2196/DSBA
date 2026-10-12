// One-time codes as people type them. A code is 6 digits; after many wrong codes for an address it is 10 letters
// and digits (codeFormat "long", written ABCDE-FGH23), which nobody can guess (decision D4).
import type { OtpChallengeOut } from '../api/types';

export type CodeFormat = NonNullable<OtpChallengeOut['codeFormat']>;

export const CODE_LENGTH: Record<CodeFormat, number> = { digits: 6, long: 10 };

/** What a person typed or pasted, as the code it can be: digits only, or letters and digits in capitals
 *  (any case, with or without the dash or spaces). */
export function normalizeCode(raw: string, format: CodeFormat): string {
  return format === 'long'
    ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH.long)
    : raw.replace(/\D/g, '').slice(0, CODE_LENGTH.digits);
}
