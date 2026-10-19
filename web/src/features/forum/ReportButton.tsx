// "Report" for a thread, a reply or a request: a quiet button and its dialog, from useReport (useReport.tsx). Both
// are in features/forum/public.ts.
import { Flag } from '@phosphor-icons/react';
import { Button, cx } from '../../ui';
import type { ReportTargetType } from './types';
import { useReport } from './useReport';

export interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  /** Visible text; defaults to 'Report'. */
  label?: string;
  className?: string;
}

/** A quiet "Report" button and its dialog; "Reported" once this person has reported it. */
export function ReportButton({ targetType, targetId, label = 'Report', className }: ReportButtonProps) {
  const report = useReport(targetType, targetId, label);
  if (!report) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={report.reported ? <Flag weight="fill" /> : Flag}
        className={cx('forum-report-button', report.reported && 'is-reported', className)}
        onClick={report.open}
        data-hub="report-button"
      >
        {report.label}
      </Button>
      {report.dialog}
    </>
  );
}
