import { describe, expect, it } from 'vitest';
import type { CareerDoc } from '../../../api/types';
import { docErrors } from '../../../ui/docEditor/errors';
import {
  CAREER_SHAPE,
  errorPlace,
  freeId,
  idFrom,
  moveItem,
  publicDoc,
  removalBlocker,
  removeItem,
  renameItem,
  replaceRef,
  savedIdsOf,
} from './doc';

function mockDoc(): CareerDoc {
  return {
    intro: 'Employers in Bahrain.',
    employersNote: 'Buttons open the employer’s own page.',
    checkedOn: 'October 2026',
    initialCount: 6,
    defaultRoleId: 'quant',
    offerTypes: {
      graduate: { label: 'Graduate programme', plural: 'Graduate programmes' },
      internship: { label: 'Internship', plural: 'Internships' },
      careers: { label: 'Careers page', plural: 'Careers pages' },
    },
    ctaLabel: { apply: 'Apply', programme: 'Programme', roles: 'Open roles' },
    effortLabel: { '1': 'Light', '2': 'Medium', '3': 'Heavy' },
    depthLabel: { '0': 'None', '1': 'Introductory', '2': 'Intermediate', '3': 'Advanced' },
    yearHints: { '1': 'Year 1 hint', '2': 'Year 2 hint', '3': 'Year 3 hint' },
    certNote: 'A note on certs',
    tracks: [
      {
        id: 'markets',
        label: 'Markets & Trading',
        short: 'Markets',
        about: 'About markets',
        modules: ['FN1024'],
        hidden: false,
      },
      {
        id: 'quant',
        label: 'Quantitative Finance',
        short: 'Quant',
        about: 'About quant',
        modules: ['ST2133'],
        hidden: false,
      },
      { id: 'hidden-track', label: 'Secret Track', short: 'Secret', about: 'Shh', modules: [], hidden: true },
    ],
    employers: [
      {
        id: 'nbb',
        name: 'National Bank of Bahrain',
        mono: 'NBB',
        sector: 'Bank',
        offers: [{ type: 'careers', name: null }],
        tracks: ['markets', 'quant', 'hidden-track'],
        why: 'Local bank',
        url: 'https://nbbonline.com',
        cta: 'roles',
        logo: null,
        hidden: false,
      },
      {
        id: 'secret-bank',
        name: 'Secret Bank',
        mono: 'SB',
        sector: 'Bank',
        offers: [{ type: 'graduate', name: 'Grad' }],
        tracks: ['markets'],
        why: 'Hidden',
        url: 'https://secret.com',
        cta: 'apply',
        logo: null,
        hidden: true,
      },
    ],
    roles: [
      {
        id: 'quant',
        label: 'Quant',
        title: 'Quantitative Analyst',
        about: 'Builds models',
        tools: ['Python', 'R'],
        skills: ['python', 'ml'],
        ask: 'How to break in?',
        close: {
          ml: { kind: 'cert', cert: 'cfa', text: 'Take CFA' },
        },
        hidden: false,
      },
      {
        id: 'trader',
        label: 'Trader',
        title: 'Market Maker',
        about: 'Trades assets',
        tools: ['Bloomberg'],
        skills: ['python'],
        ask: 'Trading tips?',
        close: {},
        hidden: false,
      },
    ],
    skills: {
      python: {
        name: 'Python',
        taught: [{ module: 'ST2133', depth: 2, what: 'Data analysis' }],
        gapNote: null,
        close: null,
      },
      ml: {
        name: 'Machine Learning',
        taught: [],
        gapNote: 'Not covered in depth',
        close: { kind: 'cert', cert: 'cfa', text: 'CFA level 1' },
      },
    },
    chosen: {
      ST2133: 'option',
      ST3188: 'elective',
    },
    certs: [
      {
        id: 'cfa',
        name: 'Chartered Financial Analyst',
        short: 'CFA',
        issuer: 'CFA Institute',
        mono: 'CFA',
        url: 'https://cfainstitute.org',
        file: null,
        goodFor: 'Portfolio management',
        effort: 3,
        effortNote: '300 hours',
        covers: ['FN1024'],
        coversNote: null,
        roles: ['quant'],
        logo: null,
        hidden: false,
      },
      {
        id: 'hidden-cert',
        name: 'Hidden Cert',
        short: 'HC',
        issuer: 'Test',
        mono: null,
        url: 'https://test.com',
        file: null,
        goodFor: 'Testing',
        effort: 1,
        effortNote: 'Quick',
        covers: [],
        coversNote: null,
        roles: [],
        logo: null,
        hidden: true,
      },
    ],
    featured: {
      id: 'tradequest',
      kind: 'Competition',
      title: 'TradeQuest',
      organiser: 'Bahrain Bourse',
      mono: 'TQ',
      logo: { kind: 'employer', id: 'nbb' },
      badge: 'Applications open',
      blurb: 'Simulated trading',
      note: 'Through university',
      url: 'https://bahrainbourse.com',
    },
    checklist: [
      { id: 'cv', title: 'A one-page CV', hint: 'No typos', link: null, hidden: false },
      {
        id: 'cfa-prep',
        title: 'Prep for CFA',
        hint: 'Read guides',
        link: { kind: 'cert', cert: 'cfa', label: 'View CFA' },
        hidden: false,
      },
    ],
    furtherStudy: {
      title: 'Heading for an MSc?',
      body: 'Good grades are needed.',
      action: { to: '/grades', label: 'Check grades' },
    },
  };
}

describe('career editor doc logic', () => {
  it('generates slug ids from names cleanly', () => {
    expect(idFrom('Bank of Bahrain & Kuwait')).toBe('bank-of-bahrain-kuwait');
    expect(idFrom('École Supérieure')).toBe('ecole-superieure');
    expect(idFrom('---ABC--123---')).toBe('abc-123');
    expect(idFrom('')).toBe('');
  });

  it('allocates free ids with collision fallback', () => {
    expect(freeId('NBB', ['bapco', 'alba'])).toBe('nbb');
    expect(freeId('NBB', ['nbb', 'bapco'])).toBe('nbb-2');
    expect(freeId('NBB', ['nbb', 'nbb-2'])).toBe('nbb-3');
    expect(freeId('', ['new'])).toBe('new-2');
  });

  it('moves items inside list bounds correctly', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(list, 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(list, 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(list, 2, -2)).toEqual(['c', 'a', 'b']);
    expect(moveItem(list, 5, 1)).toEqual(['a', 'b', 'c']);
  });

  it('updates references when an item is renamed or replaced', () => {
    const d = mockDoc();
    const updated = replaceRef(d, 'track', 'markets', 'capital-markets');
    expect(updated.employers[0]?.tracks).toContain('capital-markets');
    expect(updated.employers[0]?.tracks).not.toContain('markets');

    const roleRenamed = replaceRef(d, 'role', 'quant', 'quant-research');
    expect(roleRenamed.defaultRoleId).toBe('quant-research');
    expect(roleRenamed.certs[0]?.roles).toContain('quant-research');
  });

  it('detects removal blockers', () => {
    const d = mockDoc();
    // Default role cannot be removed
    expect(removalBlocker(d, 'role', 'quant')).toContain('The page opens on this role');
    expect(removalBlocker(d, 'role', 'trader')).toBeNull();

    // Featured logo cannot be removed
    expect(removalBlocker(d, 'employer', 'nbb')).toContain('The featured competition shows this logo');
  });

  it('removes an item and cascades cleanup', () => {
    const d = mockDoc();
    const clean = removeItem(d, 'track', 'markets');
    expect(clean.tracks.some((t) => t.id === 'markets')).toBe(false);
    expect(clean.employers[0]?.tracks).not.toContain('markets');
  });

  it('renames an item and cascades update', () => {
    const d = mockDoc();
    const renamed = renameItem(d, 'track', 'markets', 'markets-global');
    expect(renamed.tracks.some((t) => t.id === 'markets-global')).toBe(true);
    expect(renamed.employers[0]?.tracks).toContain('markets-global');
  });

  it('computes publicDoc filtering out hidden entities and links to hidden items', () => {
    const d = mockDoc();
    const pub = publicDoc(d);

    // Hidden track and employer are stripped
    expect(pub.tracks.some((t) => t.id === 'hidden-track')).toBe(false);
    expect(pub.employers.some((e) => e.id === 'secret-bank')).toBe(false);
    // Hidden cert is stripped
    expect(pub.certs.some((c) => c.id === 'hidden-cert')).toBe(false);
    // Employer track references do not include hidden tracks
    expect(pub.employers[0]?.tracks).not.toContain('hidden-track');
  });

  it('maps error paths to section and item index', () => {
    expect(errorPlace({ 'employers.0.why': 'Too short' })).toEqual({
      section: 'employers',
      item: '0',
    });
    expect(errorPlace({ 'roles.1.label': 'Required' })).toEqual({
      section: 'roles',
      item: '1',
    });
    expect(errorPlace({ 'skills.python.name': 'Required' })).toEqual({
      section: 'skills',
      item: 'python',
    });
    expect(errorPlace({ intro: 'Required' })).toEqual({ section: 'text', item: null });
    expect(errorPlace({})).toBeNull();
  });

  it('gives a step’s and a checklist link’s errors to their fields, and a list’s to the banner', () => {
    const found = docErrors(
      {
        'data.skills.sql.close.lesson.chapter': 'Give the chapter.',
        'data.roles.0.close.sql.forum.to': 'Use a page of the hub.',
        'data.checklist.2.link.cert.cert': 'Choose a certificate.',
        'data.intro': 'String should have at least 1 character',
        'data.roles': 'List should have at most 50 items',
        data: 'There is no role “x” in the document.',
      },
      CAREER_SHAPE,
    );
    expect(found.fields).toEqual({
      'skills.sql.close.chapter': 'Give the chapter.',
      'roles.0.close.sql.to': 'Use a page of the hub.',
      'checklist.2.link.cert': 'Choose a certificate.',
      intro: 'String should have at least 1 character',
    });
    expect(found.general).toEqual(['List should have at most 50 items', 'There is no role “x” in the document.']);
  });

  it('lists saved ids for each section', () => {
    const d = mockDoc();
    expect(savedIdsOf(d, 'tracks')).toEqual(['markets', 'quant', 'hidden-track']);
    expect(savedIdsOf(d, 'employers')).toEqual(['nbb', 'secret-bank']);
    expect(savedIdsOf(d, 'roles')).toEqual(['quant', 'trader']);
    expect(savedIdsOf(d, 'certs')).toEqual(['cfa', 'hidden-cert']);
    expect(savedIdsOf(d, 'checklist')).toEqual(['cv', 'cfa-prep']);
    expect(savedIdsOf(d, 'skills')).toEqual(['python', 'ml']);
    expect(savedIdsOf(d, 'text')).toEqual([]);
  });
});
