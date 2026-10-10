// Reports: the reasons a person can give, and what the reported thing is called.
import type { ReportReason, ReportTargetType } from '../types';

export const REPORT_NOUN: Record<ReportTargetType, string> = { thread: 'thread', reply: 'reply', library_item: 'file' };

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'spam', label: 'Spam', hint: 'Adverts, scams or the same post again and again' },
  { value: 'harassment', label: 'Harassment or bullying', hint: 'Insults, threats or picking on someone' },
  { value: 'inappropriate', label: 'Inappropriate', hint: 'Offensive content, or exam questions during an exam window' },
  { value: 'copyright', label: 'Copyright', hint: 'Someone else’s work shared without permission' },
  { value: 'other', label: 'Something else', hint: 'Tell us in the note' },
];

export function reasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
