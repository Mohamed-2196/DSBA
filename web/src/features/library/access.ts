import { useAuth } from '../../auth';

/**
 * What the person may do in the library, as the API decides it: managing it needs the library.manage box, which a
 * suspended account never has (security review SEC-1), and a suspended account can't upload, star, edit or
 * delete (student test ST-8). The library offers only what will work.
 */
export function useLibraryAccess(): { suspended: boolean; moderator: boolean } {
  const { me, can } = useAuth();
  return { suspended: me?.status === 'suspended', moderator: can('library.manage') };
}
