// Reports: the reasons a person can give, and what the reported thing is called.
import type { QueueReason, ReportReason, ReportTargetType } from '../types';

export const REPORT_NOUN: Record<ReportTargetType, string> = {
  thread: 'thread',
  reply: 'reply',
  library_item: 'file',
  request: 'request',
  shared_note: 'shared note',
};

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'spam', label: 'Spam', hint: 'Adverts, scams or the same post again and again' },
  { value: 'harassment', label: 'Harassment or bullying', hint: 'Insults, threats or picking on someone' },
  {
    value: 'inappropriate',
    label: 'Inappropriate',
    hint: 'Offensive content, or exam questions during an exam window',
  },
  { value: 'copyright', label: 'Copyright', hint: 'Someone else’s work shared without permission' },
  { value: 'other', label: 'Something else', hint: 'Tell us in the note' },
];

const HUB_REASONS: Record<Exclude<QueueReason, ReportReason>, string> = {
  hub_flagged: 'Flagged by the Hub',
  hub_unchecked: 'Couldn’t be checked',
};

export function reasonLabel(reason: QueueReason): string {
  if (reason === 'hub_flagged' || reason === 'hub_unchecked') return HUB_REASONS[reason];
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
