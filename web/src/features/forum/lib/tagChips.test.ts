import { describe, expect, it } from 'vitest';
import { tagChips } from './tagChips';

const ALL = ['exam-prep', 'past-papers', 'coursework', 'r', 'python', 'excel', 'exams', 'campus'].map((id) => ({ id, label: id.toUpperCase() }));
const ids = (chips: { id: string }[]) => chips.map((c) => c.id);

describe('tagChips', () => {
  it('shows the most used tags first, at most six, without the unused ones', () => {
    const counts = { r: 9, 'exam-prep': 12, python: 1, coursework: 4, excel: 2, exams: 3, campus: 5, 'past-papers': 0 };
    const chips = tagChips({ counts, shownTags: [], allTags: ALL, selected: '' });
    expect(ids(chips)).toEqual(['exam-prep', 'r', 'campus', 'coursework', 'exams', 'excel']);
    expect(chips[0]).toEqual({ id: 'exam-prep', label: 'EXAM-PREP', count: 12 });
  });

  it('keeps the API’s order between tags used as often', () => {
    expect(ids(tagChips({ counts: { python: 2, r: 2, coursework: 2 }, shownTags: [], allTags: ALL, selected: '' }))).toEqual(['coursework', 'r', 'python']);
  });

  it('always has a chip for the tag the list is filtered by, so it can be turned off', () => {
    const chips = tagChips({ counts: { r: 3 }, shownTags: [], allTags: ALL, selected: 'campus' });
    expect(chips).toEqual([
      { id: 'r', label: 'R', count: 3 },
      { id: 'campus', label: 'CAMPUS', count: 0 },
    ]);
  });

  it('counts the threads on screen, uncounted, until the counts arrive', () => {
    const chips = tagChips({ counts: undefined, shownTags: [['r', 'exams'], ['r'], []], allTags: ALL, selected: '' });
    expect(chips).toEqual([
      { id: 'r', label: 'R', count: undefined },
      { id: 'exams', label: 'EXAMS', count: undefined },
    ]);
  });

  it('leaves out tags the forum doesn’t know', () => {
    expect(tagChips({ counts: { 'lost-and-found': 4 }, shownTags: [], allTags: ALL, selected: 'gone' })).toEqual([]);
  });
});
