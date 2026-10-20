import { createContext } from 'react';
import type { Me } from '../api/types';
import type { Box, Feature, Offer } from './access';

export interface SignInRequest {
  /** Why sign-in is needed, shown at the top of the dialog ('Sign in to reply'). */
  reason?: string;
  /** Runs once the person is signed in with a complete profile (e.g. retry the vote they tried). */
  onSuccess?: () => void;
  /** Runs when the person closes the dialog without signing in. */
  onCancel?: () => void;
}

export type AuthStatus = 'loading' | 'guest' | 'signed-in';

export interface AuthValue {
  me: Me | null;
  status: AuthStatus;
  /** what /me's boxes allow: nothing while the account is suspended */
  can: (box: Box) => boolean;
  /** how to offer an action that needs this box (see offerOf) */
  offer: (box: Box) => Offer;
  /** the action that needs this box is shown: the person holds it, or is asked to sign in first */
  mayTry: (box: Box) => boolean;
  /** the feature is on for this person (admins: every feature) */
  featureOn: (feature: Feature) => boolean;
  /** an admin sees this feature, but it isn't on for everyone */
  offForOthers: (feature: Feature) => boolean;
  /** holds the Admin role on an active account */
  isAdmin: boolean;
  /** "Continue with Google" is set up on this hub */
  googleSignIn: boolean;
  /** holds at least one manager box: Manage is open to them */
  manages: boolean;
  roles: Me['roles'];
  /** Re-read /me (after a profile change, for instance). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  openSignIn: (request?: SignInRequest) => void;
  /**
   * Guard for actions that need an account: true when the person is signed in with a profile; otherwise the
   * sign-in dialog opens (at the profile step if that is what is missing) and it returns false.
   *   if (!requireAuth('Sign in to vote', () => vote.mutate())) return;
   */
  requireAuth: (reason?: string, onSuccess?: () => void) => boolean;
}

export const AuthContext = createContext<AuthValue | null>(null);
