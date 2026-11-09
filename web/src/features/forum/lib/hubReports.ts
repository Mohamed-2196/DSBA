// Reports from the Hub's automatic check (fromHub): closing one decides on the picture or post
// (api/app/services/forum/checks.py decide()). Dismissed shows the picture, or the post the check hid (a post a rep
// hid stays hidden); resolved removes the picture, or keeps the post hidden (hiding it when it is up). Either way the
// author is told how it ended.
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
  if (report.targetStatus === 'hidden' && report.reason === 'hub_flagged') {
    return {
      resolve: {
        label: 'Keep hidden',
        hint: 'The post stays hidden, and its author is told, with your note as the reason. They can still read it.',
      },
      dismiss: { label: 'Show to everyone', hint: 'The post is visible to everyone again, and its author is told.' },
    };
  }
  if (report.targetStatus === 'hidden') {
    return {
      resolve: { label: 'Keep hidden', hint: 'The post stays hidden. Its author can still read it.' },
      dismiss: {
        label: 'Close report',
        hint: 'A student rep hid this post, so it stays hidden. Unhide it from the thread if it should be up.',
      },
    };
  }
  return {
    resolve: { label: 'Hide it', hint: 'The post is hidden, and its author is told, with your note as the reason.' },
    dismiss: { label: 'Leave it up', hint: 'Nothing changes on the post.' },
  };
}
