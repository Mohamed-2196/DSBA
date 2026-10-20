import { useState } from 'react';
import { api, call } from '../api/client';
import { authErrorMessage } from './authErrors';
import { hereNow, markGoogleTrip } from './googleTrip';

export interface GoogleButtonProps {
  /** 'Continue with Google' (signing in) or 'Link Google' (Your account) */
  label?: string;
  /** a path in the app to come back to afterwards */
  returnTo?: string;
  /** link Google to the signed-in account instead of signing in */
  link?: boolean;
  /** what went wrong before the browser left for Google */
  onError?: (message: string) => void;
  /** as wide as its words, in a row of actions (Your account) */
  compact?: boolean;
}

/**
 * "Continue with Google", drawn as Google's branding guidelines ask (SignInDialog.css), with Google's own G. It asks
 * the API for Google's address (POST /auth/google, or /me/google to link) and sends the browser there; Google brings
 * it back to `returnTo`, with ?authError=… when it didn't work (GoogleReturn says what happened).
 */
export function GoogleButton({
  label = 'Continue with Google',
  returnTo,
  link = false,
  onError,
  compact = false,
}: GoogleButtonProps) {
  const [leaving, setLeaving] = useState(false);
  const go = async () => {
    setLeaving(true);
    try {
      const body = { returnTo: returnTo ?? hereNow() };
      const { url } = await call(
        link ? api.POST('/api/v1/me/google', { body }) : api.POST('/api/v1/auth/google', { body }),
      );
      markGoogleTrip(link ? 'link' : 'sign-in');
      window.location.assign(url);
    } catch (e) {
      setLeaving(false);
      onError?.(authErrorMessage(e));
    }
  };
  const base = import.meta.env.BASE_URL;
  return (
    <button
      type="button"
      className={compact ? 'google-button google-button--compact' : 'google-button'}
      onClick={() => void go()}
      disabled={leaving}
      data-hub="google"
    >
      <img className="google-button__g google-button__g--light" src={`${base}brand/google/g-light.png`} alt="" />
      <img className="google-button__g google-button__g--dark" src={`${base}brand/google/g-dark.png`} alt="" />
      <span>{leaving ? 'Opening Google…' : label}</span>
    </button>
  );
}
