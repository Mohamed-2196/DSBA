import { describe, expect, it } from 'vitest';
import type { IssueSection } from '../../../api/types';
import {
  LIMITS,
  addSection,
  blankBlock,
  blankCoverLine,
  draftFrom,
  fieldOfApiPath,
  fieldPath,
  jsonBytes,
  markSaved,
  mapApiErrors,
  moveByKey,
  moveSection,
  previewOf,
  removeSection,
  renameSection,
  sameContent,
  sectionOfPath,
  setKind,
  toUpdate,
  updateByKey,
  updateSection,
  validate,
  type IssueContent,
  type IssueDraft,
  type SectionDraft,
} from './draft';

const SECTIONS: IssueSection[] = [
  {
    id: 'cfa',
    title: 'BIBF is taking participants for the CFA Research Challenge',
    label: 'CFA Research Challenge',
    icon: 'ChartLineUp',
    kind: null,
    blocks: [
      { type: 'p', text: 'The challenge opens in **October**.', lead: true },
      { type: 'list', items: ['Form a team', 'Pick a company'] },
      { type: 'cta', label: 'Open the calendar', to: '/calendar' },
    ],
    after: [],
    figure: { src: 'demo/news/cfa-research-challenge.jpg', width: 986, height: 701, alt: 'The poster', caption: 'Strive for greatness.' },
    aside: null,
    window: null,
    fallback: null,
    estWords: null,
  },
  {
    id: 'launch',
    title: 'DSBA Hub launches today',
    label: null,
    icon: 'RocketLaunch',
    kind: null,
    blocks: [{ type: 'p', text: 'Everything in one place.', lead: false }],
    after: [],
    figure: null,
    aside: { type: 'stats', title: 'In numbers', items: [{ value: '16', label: 'modules' }], foot: null, wide: false },
    window: null,
    fallback: null,
    estWords: null,
  },
  {
    id: 'deadlines',
    title: 'The October session',
    label: 'Deadlines and dates',
    icon: 'CalendarCheck',
    kind: 'deadlines',
    blocks: [],
    after: [{ type: 'signoff', text: 'The editors' }],
    figure: null,
    aside: null,
    window: { from: '2026-10-06', to: '2026-11-30' },
    fallback: null,
    estWords: 90,
  },
];

const ISSUE: IssueContent = {
  title: 'Launch edition',
  number: 1,
  date: '2026-10-06',
  slug: 'launch-edition',
  dek: 'Three stories.',
  summary: 'A summary.',
  editors: ['Hawra T.', 'Zainab K.'],
  cover: { tone: 'navy', art: 'brand/newsletter-cover.jpg', artAlt: 'Cover illustration', lines: [{ section: 'cfa', text: 'Taking participants' }] },
  sections: SECTIONS,
};

const section = (d: IssueDraft, i: number): SectionDraft => {
  const s = d.sections[i];
  if (!s) throw new Error(`no section ${i}`);
  return s;
};

describe('a draft of an issue', () => {
  it('saves exactly what it was made from', () => {
    const d = draftFrom(ISSUE);
    const u = toUpdate(d);
    expect(u).toMatchObject({ title: 'Launch edition', number: 1, date: '2026-10-06', slug: 'launch-edition', editors: ['Hawra T.', 'Zainab K.'] });
    expect(u.cover).toEqual(ISSUE.cover);
    expect(u.sections).toEqual(SECTIONS);
    expect(validate(d)).toEqual({});
    expect(sameContent(d, draftFrom(ISSUE))).toBe(true);
  });

  it('trims what is saved and leaves out what a section does not use', () => {
    const d = draftFrom(ISSUE);
    const edited = updateSection({ ...d, title: '  Launch edition  ', editors: ' Hawra T. ,, Zainab K. , ' }, section(d, 0).key, (s) => ({ ...s, label: '   ', beside: 'card' }));
    const u = toUpdate(edited);
    expect(u.title).toBe('Launch edition');
    expect(u.editors).toEqual(['Hawra T.', 'Zainab K.']);
    expect(u.sections?.[0]?.label).toBeNull();
    expect(u.sections?.[0]?.figure).toBeNull(); // the picture gave way to the card
    expect(u.sections?.[0]?.aside?.type).toBe('card');
    expect(sameContent(edited, d)).toBe(false);
  });

  it('keeps the picture while another choice is shown', () => {
    const d = draftFrom(ISSUE);
    const key = section(d, 0).key;
    const back = updateSection(updateSection(d, key, (s) => ({ ...s, beside: 'stats' })), key, (s) => ({ ...s, beside: 'figure' }));
    expect(toUpdate(back).sections?.[0]?.figure?.src).toBe('demo/news/cfa-research-challenge.jpg');
  });
});

describe('checking a draft against the API’s limits', () => {
  it('asks for what is missing', () => {
    const d = draftFrom({ ...ISSUE, title: ' ', slug: 'Launch Edition', number: 1 });
    const errors = validate({ ...d, number: '1.5', date: '2026-02-30' });
    expect(errors.title).toBe('Give the issue a title.');
    expect(errors.slug).toMatch(/lowercase letters/);
    expect(errors.number).toMatch(/whole number/);
    expect(errors.date).toMatch(/date/);
  });

  it('counts characters as the API does, emoji included', () => {
    const d = draftFrom(ISSUE);
    expect(validate({ ...d, dek: '🎉'.repeat(LIMITS.standfirst) }).dek).toBeUndefined();
    expect(validate({ ...d, dek: 'a'.repeat(LIMITS.standfirst + 1) }).dek).toBe('Keep it to 2,000 characters (it has 2,001).');
    expect(validate({ ...d, editors: Array.from({ length: 13 }, (_, i) => `Editor ${i}`).join(', ') }).editors).toMatch(/12 editors at most/);
  });

  it('refuses links the API refuses, in copy and on buttons', () => {
    const d = draftFrom(ISSUE);
    const s = section(d, 0);
    const [p, list, cta] = s.blocks;
    if (!p || !list || !cta) throw new Error('blocks');
    const bad = updateSection(d, s.key, (x) => ({
      ...x,
      blocks: [
        { ...p, text: 'See [the page](http://example.com).' },
        list.type === 'list' ? { ...list, items: list.items.map((i, n) => (n === 0 ? { ...i, text: '' } : i)) } : list,
        { ...cta, to: '//evil.example' } as typeof cta,
      ],
    }));
    const errors = validate(bad);
    expect(errors[fieldPath.block(s.key, p.key, 'text')]).toMatch(/https:\/\//);
    expect(errors[fieldPath.block(s.key, cta.key, 'to')]).toMatch(/one slash/);
    if (list.type !== 'list') throw new Error('list');
    expect(errors[fieldPath.item(s.key, list.key, list.items[0]?.key ?? '')]).toBe('Write the item, or remove it.');
  });

  it('checks the cover, the numbers, the dates and the fallback', () => {
    const d = draftFrom(ISSUE);
    const stats = section(d, 1);
    const deadlines = section(d, 2);
    let bad = updateSection(d, stats.key, (s) => ({ ...s, stats: { ...s.stats, items: s.stats.items.map((i) => ({ ...i, value: 'x'.repeat(30) })) } }));
    bad = updateSection(bad, deadlines.key, (s) => ({ ...s, window: { from: '2026-11-30', to: '2026-10-06' } }));
    bad = { ...bad, cover: { ...bad.cover, lines: [...bad.cover.lines, { key: 'c-x', section: 'gone', text: 'A line' }] } };
    const errors = validate(bad);
    expect(errors[fieldPath.stat(stats.key, stats.stats.items[0]?.key ?? '', 'value')]).toMatch(/24 characters/);
    expect(errors[fieldPath.section(deadlines.key, 'window.to')]).toBe('The last day can’t be before the first.');
    expect(errors[fieldPath.line('c-x', 'section')]).toBe('Choose the story this line points to.');

    const forum = addSection(d, 'forum');
    const half = updateSection(forum.draft, forum.key, (s) => ({ ...s, fallback: { title: 'Nothing yet', text: '' } }));
    expect(validate(half)[fieldPath.section(forum.key, 'fallback.text')]).toMatch(/nothing to list/);
  });

  it('finds two sections with the same link name', () => {
    const d = draftFrom(ISSUE);
    const twin = renameSection(d, section(d, 1).key, 'cfa');
    expect(validate(twin)[fieldPath.section(section(d, 1).key, 'id')]).toMatch(/Another section/);
  });

  it('measures the whole issue as the API does', () => {
    // Python: json.dumps({"a": [1, 2], "b": "é"}, ensure_ascii=False) is 24 bytes in UTF-8.
    expect(jsonBytes({ a: [1, 2], b: 'é', c: null })).toBe(24);
    const d = draftFrom(ISSUE);
    const long = 'word '.repeat(700).trim(); // 3,499 characters a paragraph
    const huge = updateSection(d, section(d, 0).key, (s) => ({ ...s, blocks: Array.from({ length: 40 }, () => ({ ...blankBlock('p'), text: long })) }));
    const many = { ...huge, sections: [...huge.sections, ...Array.from({ length: 1 }, () => ({ ...section(huge, 0), key: 'copy', id: 'copy' }))] };
    expect(validate(many).sections).toMatch(/too long/);
  });
});

describe('the API’s error paths', () => {
  const d = draftFrom(ISSUE);
  const s0 = section(d, 0);
  const s1 = section(d, 1);

  it('land on the field that caused them', () => {
    const cta = s0.blocks[2];
    const list = s0.blocks[1];
    if (!cta || !list || list.type !== 'list') throw new Error('blocks');
    expect(fieldOfApiPath('sections.0.blocks.2.cta.to', d)).toBe(fieldPath.block(s0.key, cta.key, 'to'));
    expect(fieldOfApiPath('sections.0.blocks.1.list.items.1', d)).toBe(fieldPath.item(s0.key, list.key, list.items[1]?.key ?? ''));
    expect(fieldOfApiPath('sections.1.aside.stats.items.0.value', d)).toBe(fieldPath.stat(s1.key, s1.stats.items[0]?.key ?? '', 'value'));
    expect(fieldOfApiPath('sections.0.figure.src', d)).toBe(fieldPath.section(s0.key, 'figure.src'));
    expect(fieldOfApiPath('sections.2.window', d)).toBe(fieldPath.section(section(d, 2).key, 'window.to'));
    expect(fieldOfApiPath('cover.lines.0.text', d)).toBe(fieldPath.line(d.cover.lines[0]?.key ?? '', 'text'));
    expect(fieldOfApiPath('editors.1', d)).toBe('editors');
    expect(fieldOfApiPath('sections', d)).toBe('sections');
  });

  it('keep what names no field for the form', () => {
    const { placed, other } = mapApiErrors({ slug: 'Taken.', request: 'Broken body.' }, d);
    expect(placed).toEqual({ slug: 'Taken.' });
    expect(other).toEqual(['Broken body.']);
    expect(sectionOfPath(fieldPath.block(s0.key, 'b9', 'text'))).toBe(s0.key);
    expect(sectionOfPath('cover.art')).toBeNull();
  });
});

describe('editing', () => {
  it('moves items within bounds', () => {
    const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    expect(moveByKey(list, 'b', -1).map((x) => x.key)).toEqual(['b', 'a', 'c']);
    expect(moveByKey(list, 'c', 1).map((x) => x.key)).toEqual(['a', 'b', 'c']);
    expect(updateByKey(list, 'a', () => ({ key: 'z' })).map((x) => x.key)).toEqual(['z', 'b', 'c']);
    const d = draftFrom(ISSUE);
    expect(moveSection(d, section(d, 2).key, -1).sections.map((s) => s.id)).toEqual(['cfa', 'deadlines', 'launch']);
  });

  it('gives a new section a link name that follows its headline', () => {
    const d = draftFrom(ISSUE);
    const { draft, key } = addSection(d, 'story', section(d, 0).key);
    expect(draft.sections.map((s) => s.key).indexOf(key)).toBe(1);
    const titled = updateSection(draft, key, (s) => ({ ...s, title: 'Speech Day: our nominees' }));
    expect(titled.sections.find((s) => s.key === key)?.id).toBe('speech-day-our-nominees');
    const clash = updateSection(draft, key, (s) => ({ ...s, title: 'CFA' }));
    expect(clash.sections.find((s) => s.key === key)?.id).toBe('cfa-2');
    // An existing section keeps its link name whatever its headline says, and so does a new one once it is saved.
    expect(updateSection(d, section(d, 0).key, (s) => ({ ...s, title: 'Something else' })).sections[0]?.id).toBe('cfa');
    const saved = markSaved(titled);
    expect(updateSection(saved, key, (s) => ({ ...s, title: 'A new headline' })).sections.find((s) => s.key === key)?.id).toBe('speech-day-our-nominees');
    expect(markSaved(d)).toBe(d);
  });

  it('keeps cover lines on their story', () => {
    const d = draftFrom(ISSUE);
    const renamed = renameSection(d, section(d, 0).key, 'cfa-challenge');
    expect(renamed.cover.lines[0]?.section).toBe('cfa-challenge');
    expect(removeSection(renamed, section(d, 0).key).cover.lines).toEqual([]);
    expect(blankCoverLine(d).section).toBe('launch');
  });

  it('starts a live section with its usual words', () => {
    const d = draftFrom(ISSUE);
    const { draft, key } = addSection(d, 'deadlines');
    const s = draft.sections.find((x) => x.key === key);
    expect(s).toMatchObject({ kind: 'deadlines', id: 'what-s-coming-up', window: { from: '2026-10-06', to: '2026-11-30' }, estWords: 90 });
    const story = setKind(section(d, 0), 'library', d.date);
    expect(story.fallback.title).not.toBe('');
    expect(setKind(story, null, d.date).estWords).toBeNull();
  });
});

describe('the preview', () => {
  it('shows a draft that is still being written', () => {
    const d = draftFrom(ISSUE);
    const { draft, key } = addSection(d, 'story');
    const twin = renameSection(draft, key, 'cfa');
    const p = previewOf(twin);
    expect(p.sections.map((s) => s.id)).toEqual(['cfa', 'launch', 'deadlines', 'cfa-x']);
    expect(p.sections[3]?.title).toBe('Untitled section');
    expect(p.sections[3]?.blocks).toEqual([]); // the empty opening paragraph waits
    expect(p.cover.art).toBe('brand/newsletter-cover.jpg');
  });
});
