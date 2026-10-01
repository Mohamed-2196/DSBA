// Public API of the newsletter feature (agent C). Signatures are a contract — do not change them.
// Only public issues are visible here: the hidden special edition is never returned by any of these.
import { getLatest, searchIssueIndex } from './lib/issues.js';

export { LatestIssueCard } from './LatestIssueCard.jsx'; // component for Home

/** -> { slug, number, title, date, summary, readMinutes } | null  (the newest published issue) */
export function getLatestIssue() {
  const i = getLatest();
  return i ? { slug: i.slug, number: i.number, title: i.title, date: i.date, summary: i.summary, readMinutes: i.readMinutes } : null;
}

/** -> [{ slug, title, number, snippet }]  (published issues whose text contains every word of the query) */
export function searchIssues(query) {
  try {
    return searchIssueIndex(query);
  } catch {
    return [];
  }
}
