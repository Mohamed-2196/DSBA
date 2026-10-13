// Whether this person may ask for something or say "me too": any active account with a profile. A guest signs in
// first; a suspended account only reads.
import { useAuth } from '../../auth';

export type MayAsk = 'yes' | 'sign-in' | 'suspended';

export function useMayAsk(): MayAsk {
  const { me } = useAuth();
  if (!me || me.needsProfile) return 'sign-in';
  return me.status === 'suspended' ? 'suspended' : 'yes';
}
