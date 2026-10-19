// Report as an action: the dialog (components/ReportDialog.tsx) -> POST /reports, for a thread, a reply, a library
// item or a request. Guests are asked to sign in first; an account without the reports.create box gets nothing. Once
// sent it says "Reported" (while the app is open), and reporting the same thing again is answered kindly
// (already_reported). ReportButton.tsx is the quiet button made from it; a library file's toolbar puts it in a menu.
import { useState, type ReactNode } from 'react';
import { useAuth } from '../../auth';
import { REPORT_NOUN } from './lib/reports';
import type { ReportTargetType } from './types';
import { ReportDialog } from './components/ReportDialog';

// What this person reported while the app is open, by account: the action then reads "Reported", so a second try
// isn't how they learn it was sent (student test). The server keeps the real record (already_reported).
const sent = new Set<string>();
const sentKey = (viewer: string | null | undefined, type: ReportTargetType, id: string) =>
  `${viewer ?? ''}|${type}|${id}`;

export interface ReportAction {
  /** 'Report' (or the label asked for), 'Reported' once this person has reported it */
  label: string;
  reported: boolean;
  /** opens the dialog; a guest signs in first */
  open: () => void;
  /** the dialog: render it once, anywhere */
  dialog: ReactNode;
}

/** Report as an action for a menu or a button; null when this account can't report. */
export function useReport(targetType: ReportTargetType, targetId: string, label = 'Report'): ReportAction | null {
  const { me, requireAuth, mayTry } = useAuth();
  const [isOpen, setOpen] = useState(false);
  const [, setSentCount] = useState(0);
  const key = sentKey(me?.id, targetType, targetId);
  const reported = sent.has(key);
  if (!mayTry('reports.create')) return null;
  return {
    label: reported ? 'Reported' : label,
    reported,
    open: () => {
      if (!requireAuth(`Sign in to report this ${REPORT_NOUN[targetType]}`, () => setOpen(true))) return;
      setOpen(true);
    },
    dialog: (
      <ReportDialog
        open={isOpen}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
        already={reported}
        onReported={() => {
          sent.add(key);
          setSentCount((n) => n + 1);
        }}
      />
    ),
  };
}
