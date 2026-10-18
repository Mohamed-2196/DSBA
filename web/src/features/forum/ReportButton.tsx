// "Report" for a thread, a reply or a library item, and its dialog (components/ReportDialog.tsx) -> POST /reports.
// Guests are asked to sign in first; an account without the reports.create box sees no button. Once sent, the button says "Reported" (while the app is open), and reporting the
// same thing again is answered kindly (already_reported). Used by the forum on threads and replies, and by the library
// on files (features/forum/public.ts).
import { useState } from 'react';
import { Flag } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { Button, cx } from '../../ui';
import { REPORT_NOUN } from './lib/reports';
import type { ReportTargetType } from './types';
import { ReportDialog } from './components/ReportDialog';

export interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  /** Visible text; defaults to 'Report'. */
  label?: string;
  className?: string;
}

// What this person reported while the app is open, by account: the button then reads "Reported", so a second try
// isn't how they learn it was sent (student test). The server keeps the real record (already_reported).
const sent = new Set<string>();
const sentKey = (viewer: string | null | undefined, type: ReportTargetType, id: string) =>
  `${viewer ?? ''}|${type}|${id}`;

/** A quiet "Report" button and its dialog; "Reported" once this person has reported it. */
export function ReportButton({ targetType, targetId, label = 'Report', className }: ReportButtonProps) {
  const { me, requireAuth, mayTry } = useAuth();
  const [open, setOpen] = useState(false);
  const [, setSentCount] = useState(0);
  const key = sentKey(me?.id, targetType, targetId);
  const reported = sent.has(key);
  if (!mayTry('reports.create')) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={reported ? <Flag weight="fill" /> : Flag}
        className={cx('forum-report-button', reported && 'is-reported', className)}
        onClick={() => {
          if (!requireAuth(`Sign in to report this ${REPORT_NOUN[targetType]}`, () => setOpen(true))) return;
          setOpen(true);
        }}
        data-hub="report-button"
      >
        {reported ? 'Reported' : label}
      </Button>
      <ReportDialog
        open={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
        already={reported}
        onReported={() => {
          sent.add(key);
          setSentCount((n) => n + 1);
        }}
      />
    </>
  );
}
