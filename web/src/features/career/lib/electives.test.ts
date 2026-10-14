import { describe, expect, it } from 'vitest';
import type { CareerDoc, CareerRole, ModuleSummary } from '../../../api/types';
import { electives } from './electives';

const mod = (id: string, year: 1 | 2 | 3): ModuleSummary => ({
  id,
  unitCode: null,
  name: id,
  shortName: id,
  year,
  description: '',
  icon: null,
  chapterCount: 0,
  lessonCount: 0,
  libraryCount: null,
});

const role = (id: string, skills: string[]): CareerRole => ({ id, label: id, title: id, about: '', tools: [], skills, ask: '', close: {} });

// Only the fields electives() reads; the rest of the document doesn't matter here.
const doc = {
  chosen: { econometrics: 'option', 'asset-pricing': 'elective', marketing: 'elective', micro: 'elective' },
  skills: {
    valuation: { name: 'Valuation', taught: [{ module: 'asset-pricing', depth: 3, what: 'How assets are valued.' }] },
    economics: {
      name: 'Economics',
      taught: [
        { module: 'economics', depth: 2, what: 'Intro.' },
        { module: 'micro', depth: 3, what: 'In depth.' },
      ],
    },
    regression: {
      name: 'Regression',
      taught: [
        { module: 'stats', depth: 3, what: 'Core.' },
        { module: 'asset-pricing', depth: 1, what: 'A little.' },
      ],
    },
    survey: { name: 'Surveys', taught: [{ module: 'marketing', depth: 0, what: '' }] },
  },
  roles: [role('risk', ['valuation', 'regression']), role('econ', ['economics']), role('analyst', ['regression'])],
} as unknown as CareerDoc;

const catalogue = [mod('economics', 1), mod('stats', 2), mod('econometrics', 2), mod('micro', 3), mod('asset-pricing', 3), mod('marketing', 3)];

describe('electives', () => {
  const list = electives(doc, catalogue);

  it('lists the electives in catalogue order, leaving out options', () => {
    expect(list.map((e) => e.module.id)).toEqual(['micro', 'asset-pricing', 'marketing']);
  });

  it('marks the skills a compulsory module doesn’t take as far, and puts them first', () => {
    const ap = list[1];
    expect(ap?.skills.map((s) => [s.id, s.adds])).toEqual([
      ['valuation', true],
      ['regression', false],
    ]);
    expect(list[0]?.skills[0]).toMatchObject({ id: 'economics', adds: true, depth: 3 });
  });

  it('leads to the roles that need what it adds', () => {
    expect(list[1]?.roles.map((r) => r.id)).toEqual(['risk']);
    expect(list[0]?.roles.map((r) => r.id)).toEqual(['econ']);
  });

  it('skips skills an elective doesn’t really teach', () => {
    expect(list[2]?.skills).toEqual([]);
    expect(list[2]?.roles).toEqual([]);
  });
});
