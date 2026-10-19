import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../api/errors';
import { TITLE_MIN, moduleCodeIn, remainingNote, threadFieldErrors, titleProblem } from './threadForm';

const refusal = (fields: Record<string, string> | null, status = 422) =>
  new ApiError({ status, code: status === 429 ? 'rate_limited' : 'invalid_input', message: 'Refused.', fields });

describe('titleProblem', () => {
  it('asks for a title, then for a longer one', () => {
    expect(titleProblem('   ')).toMatch(/^Add a title/);
    expect(titleProblem('MGF?')).toMatch(`at least ${TITLE_MIN} characters`);
  });

  it('takes a title that says what is asked, counting what is left after trimming', () => {
    expect(titleProblem('How do I find the MGF of a Gamma?')).toBeNull();
    expect(titleProblem(`  ${'x'.repeat(TITLE_MIN)}  `)).toBeNull();
    expect(titleProblem(`  ${'x'.repeat(TITLE_MIN - 1)}  `)).not.toBeNull();
  });
});

describe('threadFieldErrors', () => {
  it('puts what the API says about a field under that field', () => {
    expect(
      threadFieldErrors(refusal({ moduleId: 'Pick a module from the list.', tags: 'Pick up to 3 tags.' })),
    ).toEqual({
      moduleId: 'Pick a module from the list.',
      tags: 'Pick up to 3 tags.',
    });
  });

  it('puts a message about one tag under Tags', () => {
    expect(threadFieldErrors(refusal({ 'tags.1': 'Keep each tag under 30 characters.' }))).toEqual({
      tags: 'Keep each tag under 30 characters.',
    });
  });

  it('is null for a refusal of the whole form (a rate limit, the server) and for anything thrown that is not the API', () => {
    expect(threadFieldErrors(refusal(null, 429))).toBeNull();
    expect(threadFieldErrors(refusal({ parentId: 'Reply to the first reply instead.' }))).toBeNull();
    expect(threadFieldErrors(new Error('bug'))).toBeNull();
  });
});

describe('remainingNote', () => {
  it('shows the count only in the last fifth of the limit', () => {
    expect(remainingNote(399, 500)).toBeNull();
    expect(remainingNote(400, 500)).toBe('400/500');
    expect(remainingNote(500, 500)).toBe('500/500');
  });
});

describe('moduleCodeIn', () => {
  it('finds a module code in a title, in any case and with a space', () => {
    expect(moduleCodeIn('MT1186: domain of ln(x² − 4)')).toBe('MT1186');
    expect(moduleCodeIn('help with st 2133 q3')).toBe('ST2133');
    expect(moduleCodeIn('Is (EC1002) curved?')).toBe('EC1002');
  });
  it('leaves out what only looks like one', () => {
    expect(moduleCodeIn('May 2019 paper')).toBeNull();
    expect(moduleCodeIn('ABC1234 is not a code')).toBeNull();
    expect(moduleCodeIn('MT11860')).toBeNull();
    expect(moduleCodeIn('')).toBeNull();
  });
});
