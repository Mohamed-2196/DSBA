import { describe, expect, it } from 'vitest';
import type { ItemOut } from '../../../../api/types';
import { boardWords, playsLine, reachLines, stateLabel } from './today';

describe('stateLabel', () => {
  it('says whether today’s puzzle is out, and how often it was fixed', () => {
    expect(stateLabel({ out: false, revision: 0 })).toBe('Not opened yet');
    expect(stateLabel({ out: true, revision: 0 })).toBe('In play');
    expect(stateLabel({ out: true, revision: 1 })).toBe('Fixed once');
    expect(stateLabel({ out: true, revision: 2 })).toBe('Fixed twice');
    expect(stateLabel({ out: true, revision: 4 })).toBe('Fixed 4 times');
  });
});

describe('playsLine', () => {
  it('counts who finished and who is partway through', () => {
    expect(playsLine({ out: true, finished: 12, playing: 3 })).toBe('12 finished · 3 partway through');
    expect(playsLine({ out: true, finished: 0, playing: 1 })).toBe('1 partway through');
    expect(playsLine({ out: true, finished: 0, playing: 0 })).toBe('Opened, but nobody has played it yet.');
    expect(playsLine({ out: false, finished: 0, playing: 0 })).toMatch(/^Nobody has opened it today/);
  });
});

describe('reachLines', () => {
  it('says who starts again and who keeps their result', () => {
    expect(reachLines(3, 12)).toEqual([
      '3 students partway through start again, with a line saying why.',
      '12 students who finished keep their results and points.',
      'Guests partway through start again too.',
    ]);
    expect(reachLines(1, 1).slice(0, 2)).toEqual([
      '1 student partway through starts again, with a line saying why.',
      '1 student who finished keeps their result and points.',
    ]);
    expect(reachLines(0, 0).slice(0, 2)).toEqual([
      'Nobody signed in is partway through it.',
      'Nobody has finished it yet.',
    ]);
  });
});

describe('boardWords', () => {
  it('splits a group’s words into today’s four and the rest', () => {
    const item = {
      data: { game: 'groups', label: 'Averages', level: 1, words: ['MEAN', 'MEDIAN', 'MODE', 'MIDRANGE', 'AVERAGE'] },
    } as ItemOut;
    expect(boardWords(item, ['MODE', 'MEAN', 'AVERAGE', 'MEDIAN'])).toEqual({
      shown: ['MODE', 'MEAN', 'AVERAGE', 'MEDIAN'],
      rest: ['MIDRANGE'],
    });
  });
});
