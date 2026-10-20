import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Me } from '../api/types';
import { useToast } from '../state';
import { googleErrorMessage } from './authErrors';
import { readAuthError, takeGoogleTrip } from './googleTrip';

export interface GoogleReturnProps {
  me: Me | null;
  /** the session is known (signed in or a guest) */
  ready: boolean;
  /** open the sign-in dialog: at the profile step for a new account */
  openSignIn: () => void;
}

/**
 * Back from Google: says what happened once. A failure (?authError=…) is a toast, and the address loses it; a new
 * account goes on to the profile step; linking says Google is linked. Renders nothing.
 */
export function GoogleReturn({ me, ready, openSignIn }: GoogleReturnProps) {
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const trip = useRef<ReturnType<typeof takeGoogleTrip> | undefined>(undefined);
  trip.current ??= takeGoogleTrip();
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const failed = readAuthError(location.search);
    if (failed) {
      void navigate({ pathname: location.pathname, search: failed.search, hash: location.hash }, { replace: true });
      push({
        tone: 'alert',
        title: trip.current === 'link' ? 'Google wasn’t linked' : 'You weren’t signed in with Google',
        body: googleErrorMessage(failed.code),
        duration: 12_000,
        ...(me ? {} : { action: { label: 'Sign in', onClick: openSignIn } }),
      });
      return;
    }
    if (!me || trip.current === null) return;
    if (me.needsProfile) openSignIn();
    else if (trip.current === 'link')
      push({ tone: 'success', title: 'Google is linked', body: 'You can continue with Google from now on.' });
    else push({ tone: 'success', title: `Signed in${me.displayName ? ` as ${me.displayName}` : ''}` });
  }, [ready, me, location, navigate, push, openSignIn]);

  return null;
}
