import { describe, expect, it } from 'vitest';
import type { FurtherStudyOption } from '../../../api/types';
import type { DayKey } from '../../../lib/dates';
import {
  daysToApply,
  filterStudy,
  parseStudySort,
  regionsOf,
  sortStudy,
  studyCounts,
  studyFiltered,
  type StudyFilters,
} from './postgrad';

const option = (name: string, over: Partial<FurtherStudyOption>): FurtherStudyOption => ({
  name,
  kind: 'course',
  region: null,
  note: '',
  when: null,
  closes: null,
  url: `https://example.com/${name}`,
  ...over,
});

const gates = option('Gates Cambridge Scholarship', { kind: 'scholarship', region: 'UK', closes: '2026-12-08' });
const kaust = option('KAUST MS', { region: 'Gulf', closes: '2027-01-03', note: 'Tuition, a stipend and housing.' });
const mbzuai = option('MBZUAI master’s', { region: 'Gulf', closes: '2026-12-15' });
const mabarrah = option('AlMabarrah scholarship', { kind: 'scholarship', region: 'Bahrain' });
const all = [gates, kaust, mbzuai, mabarrah];
const none: StudyFilters = { q: '', kind: [], region: [] };
const TODAY = '2026-11-12' as DayKey;

describe('postgraduate options as a search', () => {
  it('searches names, notes and regions', () => {
    expect(filterStudy(all, { ...none, q: 'stipend' })).toEqual([kaust]);
    expect(filterStudy(all, { ...none, q: 'bahrain' })).toEqual([mabarrah]);
  });

  it('filters by kind and region, and counts each choice against the other group', () => {
    expect(filterStudy(all, { ...none, kind: ['scholarship'], region: ['UK', 'Gulf'] })).toEqual([gates]);
    expect(studyCounts(all, { ...none, region: ['Gulf'] }, 'kind')).toEqual({ course: 2 });
    expect(studyCounts(all, none, 'region')).toEqual({ UK: 1, Gulf: 2, Bahrain: 1 });
    expect(regionsOf(all)).toEqual(['Gulf', 'Bahrain', 'UK']);
    expect(studyFiltered(none)).toBe(false);
  });

  it('sorts the soonest to close first, with closed and undated ones last', () => {
    const closed = option('Closed course', { closes: '2026-10-01' });
    const order = sortStudy([mabarrah, closed, kaust, gates, mbzuai], 'closing', TODAY).map((o) => o.name);
    expect(order).toEqual([
      'Gates Cambridge Scholarship',
      'MBZUAI master’s',
      'KAUST MS',
      'AlMabarrah scholarship',
      'Closed course',
    ]);
    expect(sortStudy(all, 'name', TODAY)[0].name).toBe('AlMabarrah scholarship');
    expect(parseStudySort('closing')).toBe('closing');
    expect(parseStudySort('x')).toBe('suggested');
  });

  it('says how many days are left to apply', () => {
    expect(daysToApply('2026-12-08', TODAY)).toBe('26 days to apply');
    expect(daysToApply('2026-11-13', TODAY)).toBe('1 day to apply');
    expect(daysToApply('2026-11-12', TODAY)).toBe('Last day to apply');
    expect(daysToApply('2026-11-01', TODAY)).toBe('Closed');
    expect(daysToApply(null, TODAY)).toBeNull();
  });
});
