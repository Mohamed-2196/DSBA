import { createContext } from 'react';
import type { Me } from '../api/types';

export interface SignInRequest {
  /** Why sign-in is needed, shown at the top of the dialog ('Sign in to reply'). */
  reason?: string;
  /** Runs once the person is signed in with a complete profile (e.g. retry the vote they tried). */
  onSuccess?: () => void;
}

export type AuthStatus = 'loading' | 'guest' | 'signed-in';

export interface AuthValue {
  me: Me | null;
  status: AuthStatus;
  isModerator: boolean;
  isAdmin: boolean;
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
