// The guest list of features (GET /features) as the provider uses it. A guest's pages wait for the list; if it
// can't be read, a guest sees every feature (the API still answers 404 feature_off for one that is switched off),
// so a failed request never shows "switched off".
import { FEATURE_KEYS } from './access';

export interface GuestFeatures {
  /** a guest is waiting for the list: the app's auth status stays 'loading' */
  loading: boolean;
  /** the list featureIsOn and offForOthers read; undefined while there is none */
  list: readonly string[] | undefined;
}

export function readGuestFeatures(
  signedIn: boolean,
  query: { data: readonly string[] | undefined; isPending: boolean; isError: boolean },
): GuestFeatures {
  if (signedIn || query.data) return { loading: false, list: query.data };
  if (query.isError) return { loading: false, list: FEATURE_KEYS };
  return { loading: query.isPending, list: undefined };
}
