import { useAuth } from '../../auth';

/**
 * What the person may do in the library, as the API decides it: a suspended student rep has no powers left
 * (security review SEC-1: useAuth's isModerator says so), and a suspended account can't upload, star, edit or
 * delete (student test ST-8). The library offers only what will work.
 */
export function useLibraryAccess(): { suspended: boolean; moderator: boolean } {
  const { me, isModerator } = useAuth();
  return { suspended: me?.status === 'suspended', moderator: isModerator };
}
