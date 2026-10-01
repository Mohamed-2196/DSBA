// Resource model for a module: everything v1's subject card offered, as labelled entries.
// Links are the v1 links (Google Drive / Docs) and always open in a new tab.
import { BookOpenText, Exam, NotePencil, Notepad, PencilSimpleLine } from '@phosphor-icons/react';

/** 'a', 'a and b', 'a, b and c'. */
export function joinAnd(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Resource entries for the Overview tab, in v1's order.
 * Entry: { id, label, icon, description?, note?, links: [{ label, href, ariaLabel }], notes? }
 * plus `missing`: plain-language names of resource types nobody has shared yet.
 */
export function buildResources(m) {
  const r = m.resources;
  const entries = [];

  if (r.materials) {
    entries.push({
      id: 'materials',
      label: 'Books and study guide',
      icon: BookOpenText,
      description: `The books and study guide for ${m.unitCode || m.name}, in the shared folder.`,
      links: [{ label: 'Open original', href: r.materials, ariaLabel: 'Open the books and study guide folder (opens in a new tab)' }],
    });
  }

  if (m.notes.length) {
    entries.push({
      id: 'notes',
      label: "Students' notes",
      icon: NotePencil,
      description: m.notes.length === 1 ? 'Shared by a student who took this module.' : 'Shared by students who took this module.',
      links: [],
      notes: m.notes.map((n) => ({
        ...n,
        title: n.author && n.author === n.name ? `${n.author}'s notes` : n.name,
        byline: n.author && n.author !== n.name ? `Shared by ${n.author}` : n.author ? 'Student notes' : 'Shared note',
      })),
    });
  }

  if (r.exercises || r.exercisesNote) {
    entries.push({
      id: 'exercises',
      label: 'Exercises',
      icon: PencilSimpleLine,
      description: r.exercisesNote ? null : 'Practice questions for this module.',
      note: r.exercisesNote,
      links: r.exercises
        ? [{ label: r.exercisesNote ? 'More exercises' : 'Open original', href: r.exercises, ariaLabel: 'Open the exercises folder (opens in a new tab)' }]
        : [],
    });
  }

  if (r.vle || r.olderExams) {
    const same = r.vle && r.olderExams && r.vle === r.olderExams;
    let links;
    if (same) links = [{ label: 'VLE and older exams', href: r.vle, ariaLabel: 'Open VLE and older exams (opens in a new tab)' }];
    else {
      links = [
        r.vle && { label: 'VLE exams', href: r.vle, ariaLabel: 'Open VLE exams (opens in a new tab)' },
        r.olderExams && { label: 'Older exams', href: r.olderExams, ariaLabel: 'Open older exams (opens in a new tab)' },
      ].filter(Boolean);
    }
    entries.push({
      id: 'exams',
      label: 'Previous exams',
      icon: Exam,
      description: same
        ? 'Past papers from the VLE and older sittings, kept in one folder.'
        : r.vle && r.olderExams
          ? 'Past papers from the VLE, and older papers from earlier sittings.'
          : r.vle
            ? 'Past papers from the VLE.'
            : 'Older papers from earlier sittings.',
      links,
    });
  }

  if (r.cheatSheet) {
    entries.push({
      id: 'cheatSheet',
      label: 'Cheat sheet',
      icon: Notepad,
      description: 'A quick-reference sheet for revision.',
      links: [{ label: 'Open original', href: r.cheatSheet, ariaLabel: 'Open the cheat sheet (opens in a new tab)' }],
    });
  }

  const missing = [
    !r.materials && 'books',
    !m.notes.length && "students' notes",
    !(r.exercises || r.exercisesNote) && 'exercises',
    !(r.vle || r.olderExams) && 'past papers',
    !r.cheatSheet && 'a cheat sheet',
  ].filter(Boolean);

  return { entries, missing };
}

/** One-line summary of what a module without video lessons offers, e.g. 'Study guide and VLE exams'. */
export function resourceSummary(m) {
  const r = m.resources;
  const parts = [];
  if (r.materials) parts.push('study guide');
  if (r.vle && r.olderExams) parts.push(r.vle === r.olderExams ? 'VLE and older exams' : 'VLE exams, older exams');
  else if (r.vle) parts.push('VLE exams');
  else if (r.olderExams) parts.push('older exams');
  if (r.exercises || r.exercisesNote) parts.push('exercises');
  if (r.cheatSheet) parts.push('cheat sheet');
  if (!parts.length) return 'Resources on the way';
  const s = joinAnd(parts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
