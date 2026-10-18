import { describe, expect, it } from 'vitest';
import type { ModuleSummary } from '../../api/types';
import {
  NO_MODULE,
  checkValues,
  emptyValues,
  errorsFromApi,
  linkProblem,
  toCreateBody,
  toUpdateBody,
  type ItemFormValues,
} from './itemForm';

const ST2133: ModuleSummary = {
  id: 'advanced-stats-distribution',
  unitCode: 'ST2133',
  name: 'Advanced Statistics: Distribution Theory',
  shortName: 'Distribution theory',
  year: 2,
  description: '',
  icon: null,
  art: null,
  chapterCount: 8,
  lessonCount: 40,
  libraryCount: 5,
};
const getModule = (id: string) => (id === ST2133.id ? ST2133 : null);
const values = (patch: Partial<ItemFormValues> = {}): ItemFormValues => ({
  ...emptyValues(),
  title: 'Chapter 4 notes',
  module: ST2133.id,
  ...patch,
});
const UPLOAD = '9f0a3b2c-1d4e-4f5a-8b6c-7d8e9f0a1b2c';

describe('checkValues', () => {
  it('accepts a complete form', () => {
    expect(checkValues(values())).toEqual({});
  });

  it('asks for a title and a module', () => {
    expect(checkValues(values({ title: ' a ' })).title).toBe('Give it a title of at least 3 characters.');
    expect(checkValues(values({ module: '' })).module).toBe('Choose the module it is for, or “Not about one module”.');
  });

  it('checks the exam year only for exam kinds', () => {
    expect(checkValues(values({ kind: 'past-paper', examYear: '1890' })).examYear).toMatch(
      /^Enter a year between 1990 and /,
    );
    expect(checkValues(values({ kind: 'past-paper', examYear: '2024' }))).toEqual({});
    expect(checkValues(values({ kind: 'notes', examYear: '1890' }))).toEqual({});
  });
});

describe('request bodies', () => {
  it('takes the year from the module', () => {
    expect(toCreateBody(UPLOAD, values({ year: '1' }), getModule)).toEqual({
      uploadId: UPLOAD,
      title: 'Chapter 4 notes',
      kind: 'notes',
      moduleId: ST2133.id,
      year: 2,
      description: null,
      examYear: null,
      zone: null,
      examSession: null,
      authorName: null,
    });
  });

  it('keeps a year for files about no one module', () => {
    expect(toCreateBody(UPLOAD, values({ module: NO_MODULE, year: '3' }), getModule)).toMatchObject({
      moduleId: null,
      year: 3,
    });
    expect(toCreateBody(UPLOAD, values({ module: NO_MODULE, year: '' }), getModule)).toMatchObject({
      moduleId: null,
      year: null,
    });
  });

  it('sends the exam sitting only for exam kinds', () => {
    expect(
      toUpdateBody(values({ kind: 'past-paper', examYear: '2024', session: 'may', zone: 'B' }), getModule),
    ).toMatchObject({
      examYear: 2024,
      examSession: 'may',
      zone: 'B',
    });
    expect(
      toUpdateBody(values({ kind: 'exam-solutions', examYear: '2025', session: 'october' }), getModule),
    ).toMatchObject({ examSession: 'october' });
    expect(
      toUpdateBody(values({ kind: 'notes', examYear: '2024', session: 'may', zone: 'B' }), getModule),
    ).toMatchObject({
      examYear: null,
      examSession: null,
      zone: null,
    });
  });

  it('trims text and clears empty fields', () => {
    expect(
      toUpdateBody(values({ title: '  Notes  ', description: '   ', authorName: ' UoL ' }), getModule),
    ).toMatchObject({
      title: 'Notes',
      description: null,
      authorName: 'UoL',
    });
  });
});

describe('errorsFromApi', () => {
  it('puts the API’s field messages on the form’s fields', () => {
    expect(
      errorsFromApi({ moduleId: 'Pick a module from the list.', 'body.title': 'Too long.', unknown: 'x' }),
    ).toEqual({
      module: 'Pick a module from the list.',
      title: 'Too long.',
    });
    expect(errorsFromApi({ examYear: 'Too early.', examSession: 'Pick May or October.' })).toEqual({
      examYear: 'Too early.',
      session: 'Pick May or October.',
    });
  });
});

describe('linkProblem', () => {
  it('takes an https:// link to another site, and nothing else', () => {
    expect(linkProblem('https://www.london.ac.uk/past-papers')).toBeNull();
    expect(linkProblem(' ')).toBe('Paste the link.');
    expect(linkProblem('http://example.com')).toBe('Use an https:// link.');
    expect(linkProblem('example.com/papers')).toBe('Use an https:// link.');
    expect(linkProblem('https://user:pw@example.com')).toBe('Remove the user name and password from the link.');
    expect(linkProblem('https://drive.google.com/file/d/1abc/view')).toMatch(/Google Drive/);
    expect(linkProblem('https://DOCS.google.com/document/d/1abc')).toMatch(/Google Drive/);
  });
});
