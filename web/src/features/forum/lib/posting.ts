import { useAuth } from '../../../auth';

/** "Start a thread" belongs on the page: the forum is on and the person may post (a guest signs in to post). */
export function useStartsThreads(): boolean {
  const { featureOn, mayTry } = useAuth();
  return featureOn('forum') && mayTry('forum.post');
}
