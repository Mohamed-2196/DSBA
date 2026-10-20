// Public API of the library feature: other features import from here only.
//   <ModuleFiles moduleId />            the module page's Files tab (loaded on demand)
//   useLibraryUpload({ moduleId, year }) "Upload a file" anywhere: { start, dialog } (render `dialog`; guests sign in
//                                        first; `start` is null while uploading isn't offered). Decision D6:
//                                        contributing means uploading to the library.
//   useRecentFiles({ n, year, enabled }) newest published items: { data: LibraryItem[] | undefined, isPending, isError, refetch }
//   <UploadsQueue />                    moderators' review queue (Manage's Uploads section)
//   <FlaggedQuestions />                question tags flagged as wrong, to keep or remove (Manage's Uploads section)
//   <PaperTagging />                    Claude's tagging of new past papers, to run again (admins; Manage's Uploads)
//   <LibraryCover item size />          a file's first page in a list (its drawn document while it has none)
//   libraryItemPath(item)               '/library/<slug>', the item's page
//   libraryTimeMeHref(item)             the paper's page with Time me started
//   libraryKindLabel(kind)              'Past paper', 'Students’ notes', …
//   libraryItemTitle(item, moduleTag)   how lists name an item: a paper by its sitting ('ST2133 · May 2019 · Zone A',
//                                        or without the code when moduleTag is null), anything else by its title
//   <ChapterQuestions moduleId chapterId />  the Lessons tab's past exam questions tagged with a chapter, grouped by
//                                        its study guide's topics (render it only while library.questions is on)
//   <DailyQuestion question moduleName examDays className />
//                                        Home's past question a day before the next exam (GET /home picks it)
//   usePaperSittings(moduleId)          a module's past papers, reports and solutions by sitting, newest first
//                                        ({ sittings, other })
//   <SittingsTable sittings linkState board className? />
//                                        the past papers table, one row per sitting (stacked where it's under 700 px
//                                        wide, as in a card); linkState { from } is where the paper's Back goes
//   useModuleQuestions(moduleId)       a module's past exam questions tagged by chapter (Noora's full page asks about one)
//   questionNumber(question)            '3', or 'B1' on a paper that numbers each section from 1
//   useModulePractice(moduleId)         the module page's practice: { isPending, chapters, total } (chapters with tagged
//                                        questions and the student's progress through each; null while practice is off
//                                        for them or nothing is tagged)
//   practisePath(moduleId, chapterId, topic?)  the chapter's practise page, or one topic's (?topic=);
//                                        progressLabel(progress) '30 of 87 done, 4 stuck'
//   LIBRARY_KINDS, LIBRARY_EXAM_KINDS   every kind in the library's order; the kinds that carry an exam year and zone
//   useTimeMe()                         the paper being timed with Time me ({ timer, start, pause, resume, end, stop }),
//                                        kept in this browser
//   <TimerPill />                       the floating Time me clock, on every page but the paper's own (the shell
//                                        mounts it once)
//   <ClockText timer />                 '1:23:45 left' for the paper being timed, ticking
//   timedPaperPath(paper)               the timed paper's page
import { createElement, lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { showsUpload, useAuth } from '../../auth';
import type { CohortYear } from '../../state';
import { Skeleton } from '../../ui';

export { useRecentFiles } from './api';
export { questionNumber, useModuleQuestions, usePaperSittings } from './papers';
export { practisePath, progressLabel, useModulePractice } from './practice';
export { SittingsTable } from './components/SittingsTable';
export { CoverThumb as LibraryCover } from './components/CoverThumb';
export { itemPath as libraryItemPath, timeMeHref as libraryTimeMeHref } from './api';
export { examTitle as libraryItemTitle, isNew as isNewLibraryItem } from './display';
export {
  EXAM_KINDS as LIBRARY_EXAM_KINDS,
  KINDS as LIBRARY_KINDS,
  docTone as libraryDocTone,
  kindLabel as libraryKindLabel,
} from './kinds';
export { UploadsQueue } from './UploadsQueue';
export { ChapterQuestions } from './ChapterQuestions';
export { FlaggedQuestions } from './FlaggedQuestions';
export { PaperTagging } from './PaperTagging';
export { DailyQuestion } from './DailyQuestion';
export { ClockText, TimerPill, useTimeMe } from './viewer/ExamTimer';
export { timedPaperPath, type RunningTimer, type TimedPaper } from './timeMe';

const LazyModuleFiles = lazy(() => import('./ModuleFiles'));
const LazyUploadDialog = lazy(() => import('./components/UploadDialog').then((m) => ({ default: m.UploadDialog })));

/** The module page's Files tab: the module's files grouped by type, with Upload. */
export function ModuleFiles({ moduleId }: { moduleId: string }) {
  return createElement(
    Suspense,
    {
      fallback: createElement(
        'div',
        { style: { display: 'grid', gap: 12 } },
        createElement(Skeleton, { height: 24, width: 260 }),
        createElement(Skeleton, { height: 160, radius: 16 }),
      ),
    },
    createElement(LazyModuleFiles, { moduleId }),
  );
}

/**
 * The library's upload dialog, opened from another feature (a module page): `start()` asks a guest to sign in
 * first, then opens it with the module chosen; render `dialog` once anywhere in the page. The dialog's code loads
 * the first time it opens. `start` is null while the library takes no uploads or the account can't upload: leave
 * the button out then.
 */
export function useLibraryUpload({
  moduleId = null,
  year = null,
}: { moduleId?: string | null; year?: CohortYear | null } = {}): {
  start: (() => void) | null;
  dialog: ReactNode;
} {
  const { requireAuth, featureOn, mayTry } = useAuth();
  const shown = showsUpload(featureOn, mayTry);
  const [state, setState] = useState({ open: false, key: 0 });
  const open = useCallback(() => setState((s) => ({ open: true, key: s.key + 1 })), []);
  const start = useCallback(() => {
    if (requireAuth('Sign in to upload a file', open)) open();
  }, [requireAuth, open]);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const dialog =
    shown && state.key > 0
      ? createElement(
          Suspense,
          { fallback: null },
          createElement(LazyUploadDialog, {
            key: state.key,
            open: state.open,
            onClose: close,
            defaultModuleId: moduleId,
            defaultYear: year,
          }),
        )
      : null;
  return { start: shown ? start : null, dialog };
}
