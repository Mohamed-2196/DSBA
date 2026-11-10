// Which of the notice's conditional sections show. Each names an outside service only while it handles students'
// data: GET /privacy says so for Anthropic and AI apps, and the build for analytics (VITE_POSTHOG_KEY).
import type { PrivacyOut } from '../../api/types';

export interface Shown {
  nooraAnswers: boolean;
  forumCheck: boolean;
  aiApps: boolean;
  analytics: boolean;
}

/** Before the answer arrives nothing conditional shows; if it can't be read, all of them do: the notice may name a
 *  service the Hub isn't using, never leave out one it is. */
export function shownSections(services: PrivacyOut | undefined, failed: boolean, analytics: boolean): Shown {
  if (services) return { ...services, analytics };
  return { nooraAnswers: failed, forumCheck: failed, aiApps: failed, analytics };
}
