import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, call } from '../api/client';
import { ApiError } from '../api/errors';
import { ACCOUNT_KEY, FEATURES_KEY } from '../api/keys';
import type { Me } from '../api/types';
import { useAccountYearSync, useToast } from '../state';
import { canDo, featureIsOn, isActiveAdmin, managerBoxes, offerOf, offered, offForOthers } from './access';
import { AuthContext, type AuthValue, type SignInRequest } from './context';
import { ME_KEY, clearPersonalStorage, resetPersonalQueries } from './queries';
import { readGuestFeatures } from './guestFeatures';
import { createSessionGuard } from './sessionGuard';
import { SignInDialog } from './SignInDialog';
import { StepUpDialog } from './StepUpDialog';

/** The API's CSRF cookie (as in api/client.ts): signing in and stepping up replace it. */
const CSRF_COOKIE: string = import.meta.env.VITE_CSRF_COOKIE || 'dsba_csrf';

function readCsrfCookie(): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(CSRF_COOKIE.length + 1)) : null;
}

interface SignInState {
  reason?: string;
  resumes: boolean;
  /** the session ended under someone signed in: they sign in again, and the page stays as it was meanwhile */
  reauth: boolean;
}

/** A sign-in request, and whether it came from a session that ended (the session guard). */
interface Waiting extends SignInRequest {
  reauth?: boolean;
}

interface StepUpState {
  purpose: string;
  resolve: (ok: boolean) => void;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [signIn, setSignIn] = useState<SignInState | null>(null);
  const [stepUp, setStepUpState] = useState<StepUpState | null>(null);
  const stepUpRef = useRef<StepUpState | null>(null);
  const setStepUp = useCallback((next: StepUpState | null) => {
    stepUpRef.current = next;
    setStepUpState(next);
  }, []);
  // Everyone waiting for the sign-in dialog: its success runs every onSuccess once, closing it every onCancel.
  const waitingRef = useRef<Waiting[]>([]);
  // The account whose session ended, so a burst of refusals tells the person once.
  const endedRef = useRef<string | null>(null);
  const reauthPending = () => waitingRef.current.some((r) => r.reauth);

  const openRequest = useCallback((req: Waiting) => {
    waitingRef.current.push(req);
    setSignIn((prev) => ({
      reason: req.reason ?? prev?.reason,
      resumes: waitingRef.current.some((r) => !!r.onSuccess),
      reauth: waitingRef.current.some((r) => r.reauth),
    }));
  }, []);
  const openSignIn = useCallback((req: SignInRequest = {}) => openRequest(req), [openRequest]);

  /** Show a guest, so Sign in comes back; keep their drafts (not their account's cached data). */
  const showGuest = useCallback(() => {
    qc.setQueryData(ME_KEY, null);
    void resetPersonalQueries(qc);
  }, [qc]);

  const onSignedIn = useCallback(() => {
    const waiting = waitingRef.current;
    waitingRef.current = [];
    setSignIn(null);
    for (const r of waiting) r.onSuccess?.();
  }, []);
  const onDismissed = useCallback(() => {
    const waiting = waitingRef.current;
    waitingRef.current = [];
    setSignIn(null);
    // Not signing in again after the session ended: from now on this is a guest.
    if (waiting.some((r) => r.reauth) && qc.getQueryData(ME_KEY)) showGuest();
    for (const r of waiting) r.onCancel?.();
  }, [qc, showGuest]);

  /** The session ended while the app showed someone signed in (signed out on another device, expired). After an
   *  action, the sign-in dialog opens next and says so, and the page stays as it is until the person signs in
   *  again or closes it (so the action carries on into the same screen). After a read: a guest, told quietly. */
  const sessionEnded = useCallback(
    ({ userId, write }: { userId: string; write: boolean }) => {
      if (write || reauthPending() || endedRef.current === userId) return;
      endedRef.current = userId;
      showGuest();
      push({
        tone: 'info',
        title: 'You were signed out',
        body: 'Sign in again to carry on.',
        duration: 10_000,
        action: { label: 'Sign in', onClick: () => openRequest({}) },
      });
    },
    [push, openRequest, showGuest],
  );
  const sessionEndedRef = useRef(sessionEnded);
  sessionEndedRef.current = sessionEnded;

  // Who is signed in: GET /auth/session never answers 401, so a guest's page load logs no error (ST-10). Read
  // again whenever the tab comes back (UX-1): a session ended elsewhere shows here without a reload.
  const sessionQuery = useQuery({
    queryKey: ME_KEY,
    queryFn: async ({ client }): Promise<Me | null> => {
      const before = client.getQueryData<Me | null>(ME_KEY) ?? null;
      const { me } = await call(api.GET('/api/v1/auth/session'));
      // Signing in again after a session ended: keep the page as it was until that is done.
      if (before && !me && reauthPending()) return before;
      if (before && !me) queueMicrotask(() => sessionEndedRef.current({ userId: before.id, write: false }));
      else if (before && me && before.id !== me.id) void resetPersonalQueries(client); // another tab switched accounts
      return me ?? null;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const me = sessionQuery.data ?? null;

  // The guest list of features. Signed in, /me carries the list; it's fetched for admins too, to mark what's off for
  // others. /features answers a signed-in person with their own list, so it always goes without credentials.
  // A guest's pages wait for it (retried once, not three times); if it fails, a guest sees every feature.
  // Without a CSRF cookie (set at sign-in) this browser is almost surely a guest's, so the list is asked for alongside
  // the session rather than after it.
  const featuresQuery = useQuery({
    queryKey: FEATURES_KEY,
    queryFn: async () => (await call(api.GET('/api/v1/features', { credentials: 'omit' }))).features,
    enabled: sessionQuery.isPending ? readCsrfCookie() === null : !me || isActiveAdmin(me),
    staleTime: 60_000,
    retry: 1,
  });
  const guestFeatures = readGuestFeatures(!!me, featuresQuery);
  useEffect(() => {
    if (me) endedRef.current = null;
  }, [me]);

  // A signed-in student's cohort is the year the Hub shows by default; the status stays 'loading' until it shows.
  const yearShown = useAccountYearSync(me?.year ?? null);

  // Every API call goes through the session guard: a 401 on an action asks the person to sign in again and then
  // sends it again (UX-1); a 403 step_up_required asks for a code first (D2).
  useEffect(() => {
    const guard = createSessionGuard({
      currentUserId: () => qc.getQueryData<Me | null>(ME_KEY)?.id ?? null,
      sessionEnded: (info) => sessionEndedRef.current(info),
      signIn: (reason) =>
        new Promise<string | null>((resolve) =>
          openRequest({
            reason,
            reauth: qc.getQueryData<Me | null>(ME_KEY) != null,
            onSuccess: () => resolve(qc.getQueryData<Me | null>(ME_KEY)?.id ?? null),
            onCancel: () => resolve(null),
          }),
        ),
      stepUp: (purpose) => new Promise<boolean>((resolve) => setStepUp({ purpose, resolve })),
      csrfToken: readCsrfCookie,
      send: (request) => fetch(request),
    });
    api.use(guard);
    return () => api.eject(guard);
  }, [qc, openRequest, setStepUp]);

  const finishStepUp = useCallback(
    (ok: boolean) => {
      const current = stepUpRef.current;
      setStepUp(null);
      // A step-up renews this browser's session: the account page's device list changes.
      if (ok) void qc.invalidateQueries({ queryKey: ACCOUNT_KEY });
      current?.resolve(ok);
    },
    [qc, setStepUp],
  );

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ME_KEY });
  }, [qc]);

  const signOut = useCallback(async () => {
    try {
      await call(api.POST('/api/v1/auth/logout'));
    } catch (e) {
      // Already signed out (the session expired or was revoked elsewhere) is fine; anything else is not:
      // the session cookie would still work, so don't pretend.
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
    endedRef.current = null;
    qc.setQueryData(ME_KEY, null);
    // Everything personal (stars, votes, notifications, drafts) is forgotten; what is on screen is re-read as a guest.
    clearPersonalStorage();
    await resetPersonalQueries(qc);
  }, [qc]);

  const value = useMemo<AuthValue>(() => {
    const ready = !!me && !me.needsProfile;
    return {
      me,
      status: sessionQuery.isPending || guestFeatures.loading || !yearShown ? 'loading' : me ? 'signed-in' : 'guest',
      can: (box) => canDo(me, box),
      offer: (box) => offerOf(me, box),
      mayTry: (box) => offered(offerOf(me, box)),
      featureOn: (feature) => featureIsOn(me, guestFeatures.list, feature),
      offForOthers: (feature) => offForOthers(me, guestFeatures.list, feature),
      isAdmin: isActiveAdmin(me),
      manages: managerBoxes(me).length > 0,
      roles: me?.roles ?? [],
      refresh,
      signOut,
      openSignIn,
      requireAuth: (reason, onSuccess) => {
        if (ready) return true;
        openRequest({ reason, onSuccess });
        return false;
      },
    };
  }, [
    me,
    guestFeatures.list,
    guestFeatures.loading,
    sessionQuery.isPending,
    yearShown,
    refresh,
    signOut,
    openSignIn,
    openRequest,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInDialog
        open={signIn !== null}
        reason={signIn?.reason}
        resumes={signIn?.resumes}
        reauth={signIn?.reauth}
        onDone={onSignedIn}
        onDismiss={onDismissed}
      />
      <StepUpDialog purpose={stepUp?.purpose ?? null} me={me} onDone={finishStepUp} />
    </AuthContext.Provider>
  );
}
