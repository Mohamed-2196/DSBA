import { describe, expect, it } from 'vitest';
import { blankBlock, draftFrom, fieldOfApiPath, fieldPath, toUpdate, validate, type IssueContent } from './draft';
import { readMinutes } from './text';

const POLL = { type: 'poll' as const, id: 'emails', question: 'Should emails be on by default?', answers: ['Yes', 'No'], closed: false };
const ISSUE: IssueContent = {
  title: 'The October issue',
  number: 2,
  date: '2026-10-20',
  slug: 'october-issue',
  dek: '',
  summary: '',
  editors: [],
  cover: { tone: 'navy', art: null, lines: [] },
  sections: [
    { id: 'ask', title: 'Ask the cohort', label: null, icon: null, kind: null, blocks: [POLL], after: [], figure: null, aside: null, window: null, fallback: null, estWords: null },
  ],
};

describe('polls in the editor', () => {
  it('round-trips a poll, keeping its id', () => {
    const d = draftFrom(ISSUE);
    expect(validate(d)).toEqual({});
    expect(toUpdate(d).sections?.[0]?.blocks).toEqual([POLL]);
  });

  it('asks for a question and at least two answers', () => {
    const d = draftFrom(ISSUE);
    const s = d.sections[0];
    const poll = s?.blocks[0];
    if (!s || poll?.type !== 'poll') throw new Error('no poll');
    const one = { ...poll, question: '', answers: poll.answers.slice(0, 1) };
    const errors = validate({ ...d, sections: [{ ...s, blocks: [one] }] });
    expect(errors[fieldPath.block(s.key, poll.key, 'question')]).toBe('Write the question, or remove the poll.');
    expect(errors[fieldPath.block(s.key, poll.key, 'answers')]).toBe('A poll needs at least two answers.');
  });

  it('maps an API error on an answer to its field', () => {
    const d = draftFrom(ISSUE);
    const s = d.sections[0];
    const poll = s?.blocks[0];
    if (!s || poll?.type !== 'poll') throw new Error('no poll');
    expect(fieldOfApiPath('sections.0.blocks.0.poll.answers.1', d)).toBe(fieldPath.item(s.key, poll.key, poll.answers[1]?.key ?? ''));
  });

  it('gives a new poll an id of its own and two empty answers', () => {
    const a = blankBlock('poll');
    const b = blankBlock('poll');
    if (a.type !== 'poll' || b.type !== 'poll') throw new Error('not a poll');
    expect(a.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(a.id).not.toBe(b.id);
    expect(a.answers).toHaveLength(2);
  });

  it('counts the poll in the read time', () => {
    expect(readMinutes({ ...ISSUE, sections: ISSUE.sections })).toBeGreaterThan(0);
  });
});
