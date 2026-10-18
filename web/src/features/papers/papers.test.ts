import { describe, expect, it } from 'vitest';
import type { ModuleSummary } from '../../api/types';
import {
  CHOICES,
  cleanPicks,
  isMine,
  modulesFor,
  papersFor,
  papersNote,
  pickOnly,
  picksSummary,
  togglePick,
} from './papers';

const mod = (id: string, year: 1 | 2 | 3): ModuleSummary => ({
  id,
  year,
  unitCode: null,
  name: id,
  shortName: id,
  description: '',
  icon: null,
  art: null,
  chapterCount: 0,
  lessonCount: 0,
  libraryCount: null,
});

const catalogue = [
  mod('statistics', 1),
  mod('mathematics', 1),
  mod('advanced-stats-inferential', 2),
  mod('econometrics', 2),
  mod('information-systems', 2),
  mod('machine-learning', 3),
  mod('microeconomics', 3),
  mod('asset-pricing', 3),
  mod('marketing-management', 3),
];

describe('papersFor', () => {
  it('is every module of the year without picks', () => {
    expect(papersFor(2, 2, [], catalogue)).toBeNull();
    expect(papersFor(null, 2, ['econometrics'], catalogue)).toBeNull();
  });

  it('keeps only the option picked, with the compulsory modules', () => {
    expect([...(papersFor(2, 2, ['econometrics'], catalogue) ?? [])]).toEqual([
      'advanced-stats-inferential',
      'econometrics',
    ]);
    // Abstract Mathematics has no module: both Hub options go
    expect([...(papersFor(2, 2, ['abstract-maths'], catalogue) ?? [])]).toEqual(['advanced-stats-inferential']);
  });

  it('adds papers from other years in your own year only', () => {
    const mine = papersFor(3, 3, ['statistics', 'microeconomics', 'asset-pricing'], catalogue);
    expect([...(mine ?? [])]).toEqual(['machine-learning', 'microeconomics', 'asset-pricing', 'statistics']);
    expect(papersFor(1, 3, ['statistics', 'microeconomics'], catalogue)).toBeNull(); // browsing Year 1
  });
});

describe('isMine', () => {
  const papers = new Set(['econometrics', 'statistics']);
  it('counts a module event only for your papers, whatever its year', () => {
    expect(isMine({ moduleId: 'econometrics', year: 2 }, 2, papers)).toBe(true);
    expect(isMine({ moduleId: 'information-systems', year: 2 }, 2, papers)).toBe(false);
    expect(isMine({ moduleId: 'statistics', year: 1 }, 2, papers)).toBe(true);
  });
  it('follows the year for other events', () => {
    expect(isMine({ moduleId: null, year: 2 }, 2, papers)).toBe(true);
    expect(isMine({ moduleId: null, year: 1 }, 2, papers)).toBe(false);
    expect(isMine({ moduleId: null, year: null }, 2, papers)).toBe(true);
    expect(isMine({ moduleId: 'information-systems', year: 2 }, 2, null)).toBe(true);
  });
});

it('modulesFor lists your year, then other years', () => {
  expect(modulesFor(2, new Set(['statistics', 'econometrics']), catalogue).map((m) => m.id)).toEqual([
    'econometrics',
    'statistics',
  ]);
  expect(modulesFor(1, null, catalogue).map((m) => m.id)).toEqual(['statistics', 'mathematics']);
});

it('togglePick keeps a choice to its size', () => {
  const y3 = CHOICES[3];
  expect(togglePick(['microeconomics', 'asset-pricing'], 'marketing-management', y3)).toEqual([
    'asset-pricing',
    'marketing-management',
  ]);
  expect(togglePick(['econometrics'], 'information-systems', CHOICES[2])).toEqual(['information-systems']);
  expect(togglePick(['econometrics'], 'econometrics', CHOICES[2])).toEqual([]);
  expect(togglePick(['econometrics'], 'statistics')).toEqual(['econometrics', 'statistics']);
});

it('cleanPicks trusts nothing stored', () => {
  expect(cleanPicks(null)).toEqual([]);
  expect(cleanPicks(['a', 'a', 3, 'Bad Id', 'b'])).toEqual(['a', 'b']);
});

it('picksSummary', () => {
  expect(picksSummary(1, [], null)).toBe('every Year 1 module');
  expect(picksSummary(2, [], null)).toBe('Year 2, option not picked');
  expect(picksSummary(3, ['statistics'], null)).toBe('Year 3, electives not picked');
  expect(picksSummary(2, ['econometrics'], new Set(['a', 'b']))).toBe('2 modules');
  expect(picksSummary(2, ['econometrics'], new Set(['a']))).toBe('1 module');
  expect(picksSummary(null, [], null)).toBe('not set');
});

it('papersNote says what Home lists and what is left to pick', () => {
  expect(papersNote(null, [], null)).toBeNull();
  expect(papersNote(2, [], null)).toEqual({
    text: 'Pick your Year 2 option to list only the modules you sit.',
    action: 'Pick your option',
  });
  expect(papersNote(3, [], null)?.action).toBe('Pick your electives');
  expect(papersNote(1, [], null)).toEqual({ text: 'Every Year 1 module.', action: 'Change' });
  expect(papersNote(2, ['econometrics'], new Set(['a', 'b', 'c']))).toEqual({
    text: 'The 3 modules you sit.',
    action: 'Change',
  });
});

it('pickOnly keeps one module of a pick-one choice', () => {
  const choice = CHOICES[2];
  if (!choice) throw new Error('Year 2 has an option');
  expect(pickOnly(['statistics', 'econometrics'], 'information-systems', choice)).toEqual([
    'statistics',
    'information-systems',
  ]);
  expect(pickOnly(['statistics', 'econometrics'], null, choice)).toEqual(['statistics']);
});
