// The code step, shared by sign-in, by adding or changing an email or phone number, and by "confirm it's you".
// A code is 6 digits; after many wrong codes for an address it is 10 letters and digits (codeFormat "long",
// written ABCDE-FGH23), which nobody can guess (decision D4).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../api/errors';
import { CODE_LENGTH as LENGTH, normalizeCode, type CodeFormat } from './codes';
import { otpErrorMessage, waitText } from './otpErrors';
import type { OtpChallengeOut } from '../api/types';
import { Button, TextField } from '../ui';
import './SignInDialog.css';

interface OtpCredentialLike {
  code?: string;
}

/** The long code as it is written in the message: ABCDE-FGH23. */
function display(code: string, format: CodeFormat): string {
  return format === 'long' && code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

/** Android Chrome can read the code from the text message itself (WebOTP); elsewhere this does nothing. */
function useWebOtp(enabled: boolean, format: CodeFormat, onCode: (code: string) => void, resetKey: string) {
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('OTPCredential' in window) || !navigator.credentials) return undefined;
    const ac = new AbortController();
    const options = { otp: { transport: ['sms'] }, signal: ac.signal } as unknown as CredentialRequestOptions;
    navigator.credentials
      .get(options)
      .then((cred) => {
        const code = normalizeCode((cred as OtpCredentialLike | null)?.code ?? '', format);
        if (code.length === LENGTH[format]) onCodeRef.current(code);
      })
      .catch(() => {
        /* dismissed, aborted or unsupported: the person types the code */
      });
    return () => ac.abort();
  }, [enabled, format, resetKey]);
}

/**
 * When this code can't be used any more: 'new-code' (expired, too many wrong tries: only a new code helps) or
 * 'other' (the code was right, but the address belongs to another account: only a different one helps).
 */
type Stuck = 'new-code' | 'other' | null;

function stuckAfter(e: unknown): Stuck {
  if (!(e instanceof ApiError)) return null;
  if (e.code === 'code_expired' || e.code === 'too_many_attempts') return 'new-code';
  if (e.code === 'identifier_taken') return 'other';
  return null;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface CodeEntryProps {
  challenge: OtpChallengeOut;
  /** Date.now() when the challenge arrived (the resend countdown starts there) */
  receivedAt: number;
  /** check the code; throw (an ApiError) when it is wrong */
  onVerify: (code: string) => Promise<unknown>;
  /** ask for a new code; the parent swaps in the new challenge */
  onResend: () => Promise<unknown>;
  /** go back to the email or number (no button without it) */
  onBack?: () => void;
  backLabel?: string;
  submitLabel?: string;
}

/** One paste-friendly input for the code, Verify, "Send a new code" (after a countdown) and a way back. */
export function CodeEntry({ challenge, receivedAt, onVerify, onResend, onBack, backLabel = 'Use a different email or number', submitLabel = 'Verify' }: CodeEntryProps) {
  const format: CodeFormat = challenge.codeFormat ?? 'digits';
  const length = LENGTH[format];
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stuck, setStuck] = useState<Stuck>(null);
  const dead = stuck !== null;
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const firstChallenge = useRef(challenge.challengeId);

  const resendAt = receivedAt + challenge.resendAfter * 1000;
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wait]);

  // A new challenge (resend): start over with an empty input.
  useEffect(() => {
    setCode('');
    setError(null);
    setStuck(null);
    setNow(Date.now());
    if (challenge.challengeId !== firstChallenge.current) setNotice('We sent you a new code.');
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, [challenge.challengeId]);

  const verify = async (value: string) => {
    if (busyRef.current) return;
    if (value.length !== length) {
      setError(format === 'long' ? 'Enter the 10 letters and digits from the message.' : 'Enter the 6-digit code from the message.');
      inputRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy('verify');
    setError(null);
    try {
      await onVerify(value);
    } catch (e) {
      setError(otpErrorMessage(e));
      setStuck(stuckAfter(e));
      requestAnimationFrame(() => inputRef.current?.select());
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const resend = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('resend');
    setNotice(null);
    try {
      await onResend();
    } catch (e) {
      setError(otpErrorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  useWebOtp(
    challenge.channel === 'sms',
    format,
    (received) => {
      setCode(received);
      void verify(received);
    },
    challenge.challengeId,
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (stuck === 'other') onBack?.();
    else if (stuck === 'new-code') void resend();
    else void verify(code);
  };

  const lasts = `It works for ${waitText(challenge.expiresIn)}.`;
  const hint = notice ?? (challenge.channel === 'email' ? `${lasts} Not there? Check your spam folder.` : lasts);

  return (
    <form className="signin__form" onSubmit={onSubmit} noValidate>
      <TextField
        ref={inputRef}
        label={format === 'long' ? 'Code (10 letters and digits)' : '6-digit code'}
        className={format === 'long' ? 'otp__field otp__field--long' : 'otp__field'}
        size="lg"
        value={display(code, format)}
        onChange={(e) => {
          const next = normalizeCode(e.target.value, format);
          setCode(next);
          setNotice(null);
          if (error && !dead) setError(null);
          if (next.length === length && next !== code && !dead) void verify(next);
        }}
        inputMode={format === 'long' ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        autoCapitalize={format === 'long' ? 'characters' : 'off'}
        pattern={format === 'long' ? undefined : '[0-9]*'}
        autoCorrect="off"
        spellCheck={false}
        error={error}
        hint={hint}
        data-autofocus
      />
      <div className="visually-hidden" aria-live="polite">
        {error || notice || ''}
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={busy === (stuck === 'new-code' ? 'resend' : 'verify')}
        disabled={stuck === 'new-code' && wait > 0}
      >
        {stuck === 'other' ? backLabel : stuck === 'new-code' ? 'Send a new code' : submitLabel}
      </Button>
      {stuck === 'other' ? null : (
        <div className="signin__links">
          {wait > 0 ? (
            <span className="signin__wait" aria-live="off">
              You can ask for a new code in {clock(wait)}.
            </span>
          ) : dead ? null : (
            <Button variant="ghost" size="sm" onClick={() => void resend()} disabled={busy !== null} loading={busy === 'resend'}>
              Send a new code
            </Button>
          )}
          {onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack} disabled={busy !== null}>
              {backLabel}
            </Button>
          ) : null}
        </div>
      )}
    </form>
  );
}
