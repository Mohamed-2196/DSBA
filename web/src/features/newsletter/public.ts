// Public API of the newsletter feature. Other features import from here only.
//   <LatestIssueCard />   Home: the newest published issue as one card (loading, empty and error states built in)
//   useIssues({ includeDrafts })  UseQueryResult<IssueSummary[]>: issues, newest first (drafts for newsletter managers)
//   <IssuesManager />     Manage → Newsletter: every issue with its actions, and "New issue"
//   <NewsletterSettingsEditor />  Manage → Newsletter: the masthead's line and the pictures the editor offers
export { IssuesManager } from './IssuesManager';
export { NewsletterSettingsEditor } from './settings/NewsletterSettingsEditor';
export { LatestIssueCard } from './LatestIssueCard';
export { useIssues } from './api';
