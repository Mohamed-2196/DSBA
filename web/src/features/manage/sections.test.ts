import { describe, expect, it } from 'vitest';
import type { Box, Feature } from '../../auth';
import { groupSections, sectionsFor } from './sections';

const holds = (...boxes: Box[]) => (box: Box) => boxes.includes(box);
const onlyOn = (...features: Feature[]) => (feature: Feature) => features.includes(feature);

describe('sectionsFor', () => {
  it('gives a rep the queues, the newsletter, the calendar and the numbers', () => {
    expect(sectionsFor(holds('forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'stats.view'))).toEqual(['reports', 'uploads', 'newsletter', 'calendar', 'gaps', 'numbers']);
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

  it('gives content editors the modules, with no switch to wait for', () => {
    expect(sectionsFor(holds('content.edit'), onlyOn())).toEqual(['content', 'gaps']);
  });

  it('gives content editors the suggested videos while they are on', () => {
    expect(sectionsFor(holds('content.edit'), onlyOn('video_suggestions'))).toEqual(['videos', 'content', 'gaps']);
  });

  it('gives content editors the Daily puzzles while Daily is on', () => {
    expect(sectionsFor(holds('content.edit'), onlyOn('daily'))).toEqual(['content', 'daily', 'gaps']);
    expect(groupSections(['content', 'daily'])).toEqual([{ id: 'publish', label: 'Publish', sections: ['content', 'daily'] }]);
  });

  it('gives the Sunday summary to its box while it is on', () => {
    expect(sectionsFor(holds('summary.share'), onlyOn('summary'))).toEqual(['summary']);
    expect(sectionsFor(holds('summary.share'), onlyOn())).toEqual([]);
  });

  it('gives a student nothing', () => {
    expect(sectionsFor(holds('forum.post', 'library.upload'))).toEqual([]);
  });

  it('leaves out the sections of switched-off features', () => {
    const rep = holds('forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'career.edit', 'stats.view');
    expect(sectionsFor(rep, onlyOn('forum'))).toEqual(['reports', 'numbers']);
    expect(sectionsFor(rep, onlyOn('library', 'career'))).toEqual(['reports', 'uploads', 'career', 'gaps', 'numbers']);
  });

  it('gives people who handle requests the requests and their reports, while requests are on', () => {
    expect(sectionsFor(holds('requests.manage'), onlyOn('requests'))).toEqual(['reports', 'requests', 'gaps']);
    expect(sectionsFor(holds('requests.manage'), onlyOn('forum'))).toEqual([]);
  });

  it('gives the gaps to anyone who looks after the library, modules, calendar or requests', () => {
    expect(sectionsFor(holds('calendar.manage'), onlyOn('calendar'))).toEqual(['calendar', 'gaps']);
    expect(sectionsFor(holds('calendar.manage'), onlyOn())).toEqual([]);
    expect(sectionsFor(holds('newsletter.manage'))).not.toContain('gaps');
  });

  it('drops reports when the only area a person moderates is off', () => {
    expect(sectionsFor(holds('forum.moderate'), onlyOn('library'))).toEqual([]);
  });

  it('gives bug reports to admins only', () => {
    expect(sectionsFor(holds('stats.view'))).not.toContain('bugs');
    expect(sectionsFor(holds('stats.view'), undefined, true)).toEqual(['bugs', 'numbers']);
  });
});

describe('groupSections', () => {
  it('groups sections in order and drops empty groups', () => {
    expect(groupSections(['reports', 'numbers', 'bugs'])).toEqual([
      { id: 'waiting', label: 'Waiting', sections: ['reports', 'bugs'] },
      { id: 'look-after', label: 'Look after', sections: ['numbers'] },
    ]);
  });
});
