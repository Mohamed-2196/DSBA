// Public API of the bug reports feature. Other features import from here only.
//   <BugReportDialog />     the "Report a bug" dialog; the shell mounts it once
//   openBugReport()         open it, about the page on screen (account menu, More, command palette, About)
//   <BugReports />          Manage's Bugs section, for admins
export { BugReportDialog } from './BugReportDialog';
export { BugReports } from './BugReports';
export { openBugReport } from './open';
