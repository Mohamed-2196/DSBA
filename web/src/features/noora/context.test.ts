import { describe, expect, it } from 'vitest';
import type { ModuleSummary } from '../../api/types';
import { pageLabel } from './context';

const ec1002 = {
  id: 'ec1002',
  unitCode: 'EC1002',
  shortName: 'Economics',
  name: 'Introduction to economics',
  year: 1,
} as ModuleSummary;

describe('pageLabel', () => {
  it('names a module and its lessons by unit code', () => {
    expect(pageLabel('/modules/ec1002', [ec1002])).toBe('EC1002 Economics');
    expect(pageLabel('/modules/ec1002/lessons/3', [ec1002])).toBe('Lesson in EC1002');
    expect(pageLabel('/modules/unknown/lessons/3', [])).toBe('A lesson');
  });

  it('names the Hub’s pages, and one item of a list', () => {
    expect(pageLabel('/', [])).toBe('Home');
    expect(pageLabel('/calendar', [])).toBe('Calendar');
    expect(pageLabel('/forum/abc', [])).toBe('A forum thread');
    expect(pageLabel('/career/electives', [])).toBe('Choosing your electives');
    expect(pageLabel('/somewhere/else', [])).toBe('This page');
  });
});
