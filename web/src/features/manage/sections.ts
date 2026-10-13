// Which of Manage's sections a person gets, from their boxes and the features that are on for them.
import type { Box, Feature } from '../../auth';

export type SectionId = 'reports' | 'uploads' | 'requests' | 'newsletter' | 'calendar' | 'career' | 'content' | 'numbers' | 'people' | 'activity';

type Can = (box: Box) => boolean;
type On = (feature: Feature) => boolean;

const NEEDS: [SectionId, (can: Can, on: On) => boolean][] = [
  ['reports', (can, on) => (can('forum.moderate') && on('forum')) || (can('library.manage') && on('library')) || (can('requests.manage') && on('requests'))],
  ['uploads', (can, on) => can('library.manage') && on('library')],
  ['requests', (can, on) => can('requests.manage') && on('requests')],
  ['newsletter', (can, on) => can('newsletter.manage') && on('newsletter')],
  ['calendar', (can, on) => can('calendar.manage') && on('calendar')],
  ['career', (can, on) => can('career.edit') && on('career')],
  ['content', (can) => can('content.edit')],
  ['numbers', (can) => can('stats.view')],
  ['people', (can) => can('people.suspend')],
  ['activity', (can) => can('audit.read')],
];

const everyFeature: On = () => true;

export function sectionsFor(can: Can, featureOn: On = everyFeature): SectionId[] {
  return NEEDS.filter(([, needs]) => needs(can, featureOn)).map(([id]) => id);
}
