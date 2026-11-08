// Reports from the Hub's automatic check (fromHub): closing one decides on the picture or post
// (api/app/services/forum/checks.py decide()). Dismissed shows it; resolved removes the picture, or keeps the post
// hidden (hiding it when it is up).
import type { ReportOut } from '../../../api/types';

export interface HubDecision {
  /** the button and dialog wording for each way of closing it */
  resolve: { label: string; hint: string };
  dismiss: { label: string; hint: string };
}

export function hubDecision(report: ReportOut): HubDecision | null {
  if (!report.fromHub) return null;
  if (report.targetType === 'image') {
    return {
      resolve: {
        label: 'Remove picture',
        hint: 'The picture goes from the post for everyone, its uploader too, and they’re told. The rest of the post stays.',
      },
      dismiss: { label: 'Show to everyone', hint: 'Everyone who can read the post sees the picture.' },
    };
  }
  if (report.targetStatus === 'hidden') {
    return {
      resolve: { label: 'Keep hidden', hint: 'The post stays hidden. Its author can still read it.' },
      dismiss: { label: 'Show it', hint: 'The post is visible to everyone again.' },
    };
  }
  return {
    resolve: { label: 'Hide it', hint: 'The post is hidden, and its author is told.' },
    dismiss: { label: 'Leave it up', hint: 'Nothing changes on the post.' },
  };
}
