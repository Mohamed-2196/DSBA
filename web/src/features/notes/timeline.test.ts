import { describe, expect, it } from 'vitest';
import type { InkStroke } from '../../lib/ink';
import { FULL } from './text/picture';
import type { FreePicture } from './pictures/geometry';
import {
  TIMELINE_LIMIT,
  back,
  did,
  emptyTimeline,
  forward,
  inkStep,
  picturesStep,
  textMoved,
  withPictures,
  type Step,
} from './timeline';

const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#000000', width: 2, points: [0, 0, 0.5] });
const picture = (id: string): FreePicture => ({
  id,
  upload: 'u',
  sheet: 1000,
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  angle: 0,
  ratio: 1,
  crop: FULL,
  alt: '',
  caption: '',
});
const kinds = (steps: readonly Step[]) => steps.map((s) => s.kind);
const typed = (t = emptyTimeline()) => textMoved(t, 'new').timeline;

describe('the note’s timeline', () => {
  it('undoes the last thing done, typing, writing or placing a picture, and redoes it', () => {
    let t = typed();
    t = did(t, inkStep(1000, [], [stroke('a')]));
    t = did(t, picturesStep([], [picture('p')]));
    t = typed(t);
    expect(kinds(t.past)).toEqual(['text', 'page', 'page', 'text']);

    const u1 = back(t)!;
    expect(u1.step.kind).toBe('text');
    const u2 = back(u1.timeline)!;
    expect(u2.step).toEqual(picturesStep([], [picture('p')]));
    const u3 = back(u2.timeline)!;
    expect(u3.step).toEqual(inkStep(1000, [], [stroke('a')]));
    expect(kinds(u3.timeline.future)).toEqual(['text', 'page', 'page']);

    const r = forward(u3.timeline)!;
    expect(r.step).toEqual(inkStep(1000, [], [stroke('a')]));
    expect(kinds(r.timeline.past)).toEqual(['text', 'page']);
    expect(back(emptyTimeline())).toBeNull();
    expect(forward(emptyTimeline())).toBeNull();
  });

  it('forgets what was undone once something new is done', () => {
    let t = did(emptyTimeline(), inkStep(0, [], [stroke('a')]));
    t = back(t)!.timeline;
    expect(t.future).toHaveLength(1);
    t = typed(t);
    expect(t.future).toEqual([]);
  });

  it('follows the text’s own undo and redo (a tablet keyboard’s undo key)', () => {
    let t = typed();
    t = did(t, inkStep(0, [], [stroke('a')]));
    // the keyboard undid the typing: the timeline's last text step moves to the redo side, the ink stays
    const undone = textMoved(t, 'undo');
    expect(kinds(undone.timeline.past)).toEqual(['page']);
    expect(kinds(undone.timeline.future)).toEqual(['text']);
    expect(undone.moved).toEqual({ kind: 'text' });
    const redone = textMoved(undone.timeline, 'redo');
    expect(kinds(redone.timeline.past)).toEqual(['page', 'text']);
    expect(redone.timeline.future).toEqual([]);
    expect(textMoved(emptyTimeline(), 'undo').moved).toBeNull();
  });

  it('makes a picture put in line or made free one step with the text’s', () => {
    const change = { before: [picture('p')], after: [] };
    let t = withPictures(typed(), change);
    expect(t.past).toEqual([{ kind: 'text', pictures: change }]);
    // the keyboard's own undo takes the pictures back with the text
    expect(textMoved(t, 'undo').moved).toEqual({ kind: 'text', pictures: change });
    // nothing to join when the last step isn't the text's
    t = did(t, inkStep(0, [], [stroke('a')]));
    expect(withPictures(t, change)).toBe(t);
  });

  it('keeps at most TIMELINE_LIMIT steps', () => {
    let t = emptyTimeline();
    for (let i = 0; i < TIMELINE_LIMIT + 5; i++) t = typed(t);
    expect(t.past).toHaveLength(TIMELINE_LIMIT);
  });
});
