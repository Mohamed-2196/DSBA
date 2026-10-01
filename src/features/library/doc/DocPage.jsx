// One page of a mock document, rendered at its natural size (A4 794×1123, slide 1123×632,
// sheet 1123×794). Callers scale it (thumbnails, the viewer). Pages are always light paper:
// data-theme="light" re-maps the colour tokens inside, so documents look like documents in dark mode.
import { memo } from 'react';
import { cx } from '../../../ui';
import { pageSizeFor } from '../data/kinds.js';
import { getLayout } from './plan.js';
import { ExercisePage, PaperPage, ReportPage } from './PaperPages.jsx';
import { CheatPage, GuidePage, NotesPage, ReadingPage, StudyPage } from './GuidePages.jsx';
import { NotebookPage, ScriptPage, SheetPage, SlidePage } from './FormatPages.jsx';
import { Folio } from './parts.jsx';
import './doc.css';

function BlankPage({ index }) {
  return (
    <div className="lib-blank">
      <Folio n={index + 1} />
    </div>
  );
}

function componentFor(type) {
  if (type.startsWith('paper')) return PaperPage;
  if (type.startsWith('report')) return ReportPage;
  if (type.startsWith('ex-')) return ExercisePage;
  if (type.startsWith('guide')) return GuidePage;
  if (type.startsWith('reading')) return ReadingPage;
  if (type.startsWith('study')) return StudyPage;
  if (type.startsWith('notes')) return NotesPage;
  if (type === 'cheat') return CheatPage;
  if (type.startsWith('slide')) return SlidePage;
  if (type === 'sheet') return SheetPage;
  if (type === 'nb') return NotebookPage;
  if (type === 'script') return ScriptPage;
  return BlankPage;
}

/** Page `index` (0-based) of `file`, unscaled. */
export const DocPage = memo(function DocPage({ file, index = 0, className }) {
  const { ctx, pages } = getLayout(file);
  const i = Math.max(0, Math.min(index, pages.length - 1));
  const spec = pages[i];
  const size = pageSizeFor(file.format);
  const Page = componentFor(spec.type);
  return (
    <div
      className={cx('lib-doc', `lib-doc--${file.format.toLowerCase()}`, `lib-doc--${file.kind}`, className)}
      data-theme="light"
      style={{ width: size.w, height: size.h }}
    >
      <Page ctx={ctx} spec={spec} index={i} />
    </div>
  );
});
