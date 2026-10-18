import { describe, expect, it } from 'vitest';
import type { InkStroke } from '../../lib/ink';
import { TIMELINE_LIMIT, back, did, emptyTimeline, forward, inkStep, textMoved, type Step } from './timeline';

const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#000000', width: 2, points: [0, 0, 0.5] });
const kinds = (steps: readonly Step[]) => steps.map((s) => s.kind);

describe('the note’s timeline', () => {
  it('undoes the last thing done, typing or writing, and redoes it', () => {
    let t = textMoved(emptyTimeline(), 'new');
    t = did(t, inkStep(1000, [], [stroke('a')]));
    t = textMoved(t, 'new');
    expect(kinds(t.past)).toEqual(['text', 'ink', 'text']);

    const u1 = back(t)!;
    expect(u1.step.kind).toBe('text');
    const u2 = back(u1.timeline)!;
    expect(u2.step).toEqual(inkStep(1000, [], [stroke('a')]));
    expect(kinds(u2.timeline.future)).toEqual(['text', 'ink']);

    const r = forward(u2.timeline)!;
    expect(r.step.kind).toBe('ink');
    expect(kinds(r.timeline.past)).toEqual(['text', 'ink']);
    expect(back(emptyTimeline())).toBeNull();
    expect(forward(emptyTimeline())).toBeNull();
  });

  it('forgets what was undone once something new is done', () => {
    let t = did(emptyTimeline(), inkStep(0, [], [stroke('a')]));
    t = back(t)!.timeline;
    expect(t.future).toHaveLength(1);
    t = textMoved(t, 'new');
    expect(t.future).toEqual([]);
  });

  it('follows the text’s own undo and redo (a tablet keyboard’s undo key)', () => {
    let t = textMoved(emptyTimeline(), 'new');
    t = did(t, inkStep(0, [], [stroke('a')]));
    // the keyboard undid the typing: the timeline's last text step moves to the redo side, the ink stays
    t = textMoved(t, 'undo');
    expect(kinds(t.past)).toEqual(['ink']);
    expect(kinds(t.future)).toEqual(['text']);
    t = textMoved(t, 'redo');
    expect(kinds(t.past)).toEqual(['ink', 'text']);
    expect(t.future).toEqual([]);
  });

  it('keeps at most TIMELINE_LIMIT steps', () => {
    let t = emptyTimeline();
    for (let i = 0; i < TIMELINE_LIMIT + 5; i++) t = textMoved(t, 'new');
    expect(t.past).toHaveLength(TIMELINE_LIMIT);
  });
});
