import { describe, expect, it } from 'vitest';
import {
  MAX_VISITS,
  carryOnRows,
  cleanVisits,
  noteOn,
  recentKey,
  sameVisit,
  withVisit,
  withoutVisit,
  type Visit,
} from './recent';

const visit = (over: Partial<Visit> & Pick<Visit, 'id'>): Visit => ({
  kind: 'paper',
  path: `/library/${over.id}`,
  title: `Paper ${over.id}`,
  moduleId: 'st2134',
  onItem: null,
  at: 1,
  ...over,
});

describe('recent visits', () => {
  it('keeps one list per account, personal so it goes on sign-out', () => {
    expect(recentKey('u1')).toBe('hub.mine.recent.u1');
    expect(recentKey(null)).toBe('hub.mine.recent.guest');
  });

  it('puts the newest first, once, and keeps at most eight', () => {
    let list: Visit[] = [];
    for (let i = 0; i < 10; i++) list = withVisit(list, visit({ id: `p${i}`, at: i }));
    expect(list).toHaveLength(MAX_VISITS);
    expect(list[0].id).toBe('p9');
    list = withVisit(list, visit({ id: 'p5', at: 20 }));
    expect(list.map((v) => v.id).slice(0, 2)).toEqual(['p5', 'p9']);
    expect(list.filter((v) => v.id === 'p5')).toHaveLength(1);
  });

  it('tells a note from a file with the same id', () => {
    const list = withVisit([visit({ id: 'x' })], visit({ id: 'x', kind: 'note', path: '/notes/x' }));
    expect(list).toHaveLength(2);
    expect(withoutVisit(list, { kind: 'note', id: 'x' })).toEqual([visit({ id: 'x' })]);
  });

  it('reads only what it wrote', () => {
    expect(cleanVisits(null)).toEqual([]);
    expect(cleanVisits('nope')).toEqual([]);
    const good = visit({ id: 'a', at: 5 });
    const raw = [
      good,
      { ...good, id: 'b', kind: 'thread' },
      { ...good, id: 'c', path: 'https://evil.example' },
      { ...good, id: 'd', at: 'yesterday' },
      { ...good, id: 'e', at: 9, moduleId: 7 },
    ];
    const got = cleanVisits(raw);
    expect(got.map((v) => v.id)).toEqual(['e', 'a']);
    expect(got[0].moduleId).toBeNull();
  });

  it('knows when a visit changes nothing but the time', () => {
    const a = visit({ id: 'a', at: 1 });
    expect(sameVisit(a, { ...a, at: 99 })).toBe(true);
    expect(sameVisit(a, { ...a, title: 'Renamed' })).toBe(false);
    expect(sameVisit(undefined, a)).toBe(false);
  });
});

describe('carryOnRows', () => {
  const paper = visit({ id: 'p1', at: 3 });
  const note = visit({
    id: 'n1',
    kind: 'note',
    path: '/notes/n1',
    title: 'My answers',
    moduleId: null,
    onItem: 'p1',
    at: 4,
  });
  const lesson = visit({ id: 'l1', kind: 'lesson', path: '/modules/st2134/lessons/l1', at: 2 });
  const other = visit({ id: 'p2', moduleId: 'mt1186', at: 1 });
  const list = cleanVisits([paper, note, lesson, other]);

  it('shows a note written on a paper with the paper', () => {
    const rows = carryOnRows(list, {});
    expect(rows.map((r) => r.visit.id)).toEqual(['p1', 'l1', 'p2']);
    expect(rows[0].note?.id).toBe('n1');
    expect(noteOn(list, 'p1')?.id).toBe('n1');
  });

  it('shows a note on its own when its paper is not in the list', () => {
    const rows = carryOnRows([note], {});
    expect(rows.map((r) => r.visit.id)).toEqual(['n1']);
  });

  it('keeps to one module, counting a note on its paper as the module’s', () => {
    expect(carryOnRows(list, { moduleId: 'st2134' }).map((r) => r.visit.id)).toEqual(['p1', 'l1']);
    expect(carryOnRows(list, { moduleId: 'mt1186' }).map((r) => r.visit.id)).toEqual(['p2']);
  });

  it('leaves out the paper being timed, and its note', () => {
    expect(carryOnRows(list, { timedId: 'p1' }).map((r) => r.visit.id)).toEqual(['l1', 'p2']);
  });

  it('stops at n', () => {
    expect(carryOnRows(list, { n: 1 })).toHaveLength(1);
  });
});
