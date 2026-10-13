import { describe, expect, it } from 'vitest';
import type { Box, Feature } from '../../auth';
import { sectionsFor } from './sections';

const holds = (...boxes: Box[]) => (box: Box) => boxes.includes(box);
const onlyOn = (...features: Feature[]) => (feature: Feature) => features.includes(feature);

describe('sectionsFor', () => {
  it('gives a rep the queues, the newsletter, the calendar and the numbers', () => {
    expect(sectionsFor(holds('forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'stats.view'))).toEqual(['reports', 'uploads', 'newsletter', 'calendar', 'numbers']);
  });

  it('gives a newsletter manager only the newsletter', () => {
    expect(sectionsFor(holds('newsletter.manage'))).toEqual(['newsletter']);
  });

  it('shows reports to a forum moderator without the library', () => {
    expect(sectionsFor(holds('forum.moderate'))).toEqual(['reports']);
  });

  it('gives people and activity to their boxes', () => {
    expect(sectionsFor(holds('people.suspend', 'audit.read'))).toEqual(['people', 'activity']);
  });

  it('gives a student nothing', () => {
    expect(sectionsFor(holds('forum.post', 'library.upload'))).toEqual([]);
  });

  it('leaves out the sections of switched-off features', () => {
    const rep = holds('forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'career.edit', 'stats.view');
    expect(sectionsFor(rep, onlyOn('forum'))).toEqual(['reports', 'numbers']);
    expect(sectionsFor(rep, onlyOn('library', 'career'))).toEqual(['reports', 'uploads', 'career', 'numbers']);
  });

  it('gives people who handle requests the requests and their reports, while requests are on', () => {
    expect(sectionsFor(holds('requests.manage'), onlyOn('requests'))).toEqual(['reports', 'requests']);
    expect(sectionsFor(holds('requests.manage'), onlyOn('forum'))).toEqual([]);
  });

  it('drops reports when the only area a person moderates is off', () => {
    expect(sectionsFor(holds('forum.moderate'), onlyOn('library'))).toEqual([]);
  });
});
