// Contract stub, replaced by the community frontend agent: "Report" for a thread, a reply or a library item
// (opens a small dialog: reason + note -> POST /reports; asks guests to sign in).
export interface ReportButtonProps {
  targetType: 'thread' | 'reply' | 'library_item';
  targetId: string;
  /** Visible text; defaults to 'Report'. */
  label?: string;
  className?: string;
}

export function ReportButton(_props: ReportButtonProps) {
  return null;
}
