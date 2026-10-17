// Which of Manage's sections a person gets, from their boxes and the features that are on for them.
import type { Box, Feature } from '../../auth';

export type SectionId =
  | 'reports'
  | 'uploads'
  | 'requests'
  | 'bugs'
  | 'newsletter'
  | 'summary'
  | 'calendar'
  | 'career'
  | 'content'
  | 'daily'
  | 'guides'
  | 'videos'
  | 'gaps'
  | 'numbers'
  | 'people'
  | 'activity'
  | 'site';

type Can = (box: Box) => boolean;
type On = (feature: Feature) => boolean;

/** Bug reports and Site settings are Admin powers, not boxes. */
const ADMIN_ONLY: readonly SectionId[] = ['bugs', 'site'];

const NEEDS: [SectionId, (can: Can, on: On) => boolean][] = [
  ['reports', (can, on) => (can('forum.moderate') && on('forum')) || (can('library.manage') && on('library')) || (can('requests.manage') && on('requests'))],
  ['uploads', (can, on) => can('library.manage') && on('library')],
  ['requests', (can, on) => can('requests.manage') && on('requests')],
  ['videos', (can, on) => can('content.edit') && on('video_suggestions')],
  ['bugs', () => true],
  ['newsletter', (can, on) => can('newsletter.manage') && on('newsletter')],
  ['calendar', (can, on) => can('calendar.manage') && on('calendar')],
  ['summary', (can, on) => can('summary.share') && on('summary')],
  ['career', (can, on) => can('career.edit') && on('career')],
  ['content', (can) => can('content.edit')],
  ['daily', (can, on) => can('content.edit') && on('daily')],
  ['guides', (can) => can('guides.edit')],
  ['gaps', (can, on) => (can('library.manage') && on('library')) || can('content.edit') || (can('calendar.manage') && on('calendar')) || (can('requests.manage') && on('requests'))],
  ['numbers', (can) => can('stats.view')],
  ['people', (can) => can('people.suspend')],
  ['activity', (can) => can('audit.read')],
  ['site', () => true],
];

const everyFeature: On = () => true;

export function sectionsFor(can: Can, featureOn: On = everyFeature, isAdmin = false): SectionId[] {
  return NEEDS.filter(([id, needs]) => (isAdmin || !ADMIN_ONLY.includes(id)) && needs(can, featureOn)).map(([id]) => id);
}

export interface SectionGroup {
  id: 'waiting' | 'publish' | 'look-after';
  label: string;
  sections: SectionId[];
}

const GROUPS: readonly SectionGroup[] = [
  { id: 'waiting', label: 'Waiting', sections: ['reports', 'uploads', 'requests', 'videos', 'bugs'] },
  { id: 'publish', label: 'Publish', sections: ['newsletter', 'calendar', 'summary', 'career', 'content', 'daily', 'guides'] },
  { id: 'look-after', label: 'Look after', sections: ['gaps', 'numbers', 'people', 'activity', 'site'] },
];

/** The person's sections in Manage's groups (Waiting, Publish, Look after), leaving out empty groups. */
export function groupSections(sections: readonly SectionId[]): SectionGroup[] {
  return GROUPS.map((g) => ({ ...g, sections: g.sections.filter((id) => sections.includes(id)) })).filter((g) => g.sections.length > 0);
}
