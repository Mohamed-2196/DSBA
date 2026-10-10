// Public API of the newsletter feature. Other features import from here only.
//   <LatestIssueCard />   Home: the newest published issue as one card (loading, empty and error states built in)
//   useLatestIssue()      UseQueryResult<IssueSummary | null>: the newest published issue
export { LatestIssueCard } from './LatestIssueCard';
export { NEWSLETTER_KEY, useLatestIssue } from './api';
