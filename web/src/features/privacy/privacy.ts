// Which of the notice's conditional sections show. Each names an outside service only while it handles students'
// data: GET /privacy says so for Anthropic and AI apps, and the build for analytics (VITE_POSTHOG_KEY).
import type { FetchStatus } from '@tanstack/react-query';
import type { PrivacyOut } from '../../api/types';

export interface Shown {
  nooraAnswers: boolean;
  forumCheck: boolean;
  aiApps: boolean;
  analytics: boolean;
}

export interface ServicesQuery {
  data: PrivacyOut | undefined;
  isError: boolean;
  fetchStatus: FetchStatus;
}

/** The notice may name a service the Hub isn't using, never leave out one it is. So all the API's sections show
 *  whenever the current answer can't be read: an error (even with an older answer kept from before, COM-280 I5) or
 *  a request held while offline. While the first answer is on its way, none of them do. */
export function shownSections(query: ServicesQuery, analytics: boolean): Shown {
  const unknown = query.isError || query.fetchStatus === 'paused';
  if (unknown) return { nooraAnswers: true, forumCheck: true, aiApps: true, analytics };
  if (query.data) return { ...query.data, analytics };
  return { nooraAnswers: false, forumCheck: false, aiApps: false, analytics };
}
