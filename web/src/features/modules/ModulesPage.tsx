// /modules: the year's modules as a contents page: a spine of big unit codes (Year 3 modules have no code, so a
// plate with the module's icon takes the code's place), each row with name, description, counts, next exam and
// lesson progress. Follows the global year; the segmented control peeks at another year without changing it
// (?year=3).
import { ArrowCounterClockwise, CalendarBlank, CaretRight } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ModuleSummary } from '../../api/types';
import { YEARS, type CohortYear } from '../../lib/modules';
import { COHORTS, cohortColor, normalizeYear, useDocumentTitle, useQueryParam, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, CohortBadge, ModuleIcon, Page, PageHeader, ProgressRing, SegmentedControl, Skeleton, cx } from '../../ui';
import { prefetchModule } from './api';
import { useExamsByModule, type ExamInfo } from './exams';
import { ImportProgressPrompt } from './ImportProgressPrompt';
import { summaryProgress, useProgress, type Fraction } from './progress';
import './ModulesPage.css';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ModuleRow({
  module: m,
  progress,
  progressReady,
  exam,
  showExam,
  showProgress,
}: {
  module: ModuleSummary;
  progress: Fraction;
  progressReady: boolean;
  exam: ExamInfo | null;
  showExam: boolean;
  showProgress: boolean;
}) {
  const uid = useId();
  const qc = useQueryClient();
  const hasLessons = m.lessonCount > 0;
  const described = [`${uid}-desc`, `${uid}-counts`, showExam && `${uid}-exam`, showProgress && `${uid}-prog`].filter(Boolean).join(' ');
  return (
    <li className="mod-toc__item">
      <Link
        to={`/modules/${m.id}`}
        className={cx('mod-row', `mod-row--y${m.year}`, !showExam && 'mod-row--no-exam', !showProgress && 'mod-row--no-prog')}
        data-hub="module-tile"
        data-module-id={m.id}
        aria-labelledby={`${uid}-anchor ${uid}-name`}
        aria-describedby={described}
        onMouseEnter={() => void prefetchModule(qc, m.id)}
        onFocus={() => void prefetchModule(qc, m.id)}
      >
        <span className="mod-row__anchor" id={`${uid}-anchor`}>
          {m.unitCode ? (
            <span className="mod-row__code u-code">{m.unitCode}</span>
          ) : (
            <span className="mod-row__plate">
              <ModuleIcon moduleId={m.id} weight="duotone" className="mod-row__icon" />
              <span className="visually-hidden">{COHORTS[m.year].label} module:</span>
            </span>
          )}
        </span>

        <span className="mod-row__main">
          <span className="mod-row__name" id={`${uid}-name`}>
            {m.name}
          </span>
          <span className="mod-row__desc" id={`${uid}-desc`}>
            {m.description}
          </span>
          <span className="mod-row__counts" id={`${uid}-counts`}>
            {hasLessons ? (
              <>
                <span>
                  <b className="u-tabular">{m.chapterCount}</b> {m.chapterCount === 1 ? 'chapter' : 'chapters'}
                </span>
                <span>
                  <b className="u-tabular">{m.lessonCount}</b> {m.lessonCount === 1 ? 'video lesson' : 'video lessons'}
                </span>
              </>
            ) : (
              <span>Study guide and past papers</span>
            )}
            {m.libraryCount ? (
              <span>
                <b className="u-tabular">{m.libraryCount}</b> {m.libraryCount === 1 ? 'file' : 'files'}
              </span>
            ) : null}
          </span>
        </span>

        {showExam ? (
          <span className={cx('mod-row__exam', exam?.soon && 'is-soon', !exam && 'is-none')} id={`${uid}-exam`}>
            {exam ? (
              <>
                <span className="mod-row__exam-when">
                  <span className="mod-row__exam-dot" aria-hidden="true" />
                  Exam {exam.relative}
                </span>
                <span className="mod-row__exam-date">{exam.weekdayDate}</span>
              </>
            ) : (
              <span className="mod-row__exam-when">No exam date yet</span>
            )}
          </span>
        ) : null}

        {showProgress ? (
          <span className="mod-row__prog" id={`${uid}-prog`}>
            {hasLessons ? (
              progressReady ? (
                <>
                  <span aria-hidden="true">
                    <ProgressRing value={progress.pct} size={56} stroke={5} color={progress.pct === 100 ? 'var(--signal)' : cohortColor(m.year)} />
                  </span>
                  <span className="mod-row__watched">
                    <span className="u-tabular">{progress.watched}</span> of <span className="u-tabular">{progress.total}</span>
                    <span className="visually-hidden"> lessons watched</span>
                  </span>
                </>
              ) : (
                <Skeleton circle width={56} height={56} />
              )
            ) : (
              <span className="mod-row__noprog">No lessons yet</span>
            )}
          </span>
        ) : (
          <CaretRight className="mod-row__go" aria-hidden="true" />
        )}
      </Link>
    </li>
  );
}

export default function ModulesPage() {
  const { year, activeYear, setYear } = useYear();
  const [peek, setPeek] = useQueryParam('year');
  const viewYear = (normalizeYear(peek) ?? activeYear) as CohortYear;
  const peeking = year != null && viewYear !== year;
  const { getModulesForYear } = useModules();
  const { state, ready } = useProgress();
  const exams = useExamsByModule(viewYear);
  useDocumentTitle(`${COHORTS[viewYear].label} modules`);

  // Follow the global year: when it changes in the rail, drop any local peek.
  const lastYear = useRef(year);
  useEffect(() => {
    if (lastYear.current === year) return;
    lastYear.current = year;
    setPeek(null, { replace: true });
  }, [year, setPeek]);

  const rows = useMemo(
    () =>
      getModulesForYear(viewYear).map((m) => ({
        module: m,
        progress: summaryProgress(state, m.id, m.lessonCount),
        exam: exams.get(m.id) ?? null,
      })),
    [getModulesForYear, viewYear, state, exams],
  );

  const totals = rows.reduce((acc, r) => ({ videos: acc.videos + r.progress.total, watched: acc.watched + r.progress.watched }), { videos: 0, watched: 0 });
  const nextExam = rows
    .filter((r): r is typeof r & { exam: ExamInfo } => !!r.exam)
    .sort((a, b) => a.exam.days - b.exam.days)[0];
  // Columns that would say "none" on every row are left out (Year 3 has no exam dates or videos yet).
  const showExam = rows.some((r) => r.exam);
  const showProgress = totals.videos > 0;

  return (
    <Page className="mod-index">
      <PageHeader
        title="Modules"
        description={`Books, past papers, students’ notes and video lessons for every ${COHORTS[viewYear].label} module.`}
        actions={
          <SegmentedControl
            label="Show modules for"
            className="mod-index__years"
            value={viewYear}
            onChange={(y) => setPeek(y === activeYear ? null : y, { replace: true })}
            options={YEARS.map((y) => ({ value: y, label: COHORTS[y].label, color: COHORTS[y].color, onColor: COHORTS[y].on }))}
          />
        }
        meta={
          <>
            <CohortBadge year={viewYear} />
            <span className="mod-index__fact">{plural(rows.length, 'module')}</span>
            {showProgress ? (
              <span className="mod-index__fact">
                {ready ? (
                  <span>
                    <b className="u-tabular">{totals.watched}</b> of <b className="u-tabular">{totals.videos}</b> lessons watched
                  </span>
                ) : (
                  <span>
                    <b className="u-tabular">{totals.videos}</b> video lessons
                  </span>
                )}
              </span>
            ) : (
              <span className="mod-index__fact">Study guides and past papers; no video lessons yet</span>
            )}
            {nextExam ? (
              <span className="mod-index__fact mod-index__fact--exam">
                <CalendarBlank aria-hidden="true" weight="bold" />
                Next exam {nextExam.module.unitCode || nextExam.module.shortName}, {nextExam.exam.weekdayDate}
              </span>
            ) : null}
          </>
        }
      />

      {peeking && year ? (
        <div className="mod-peek" role="status">
          <p>
            You&rsquo;re looking at {COHORTS[viewYear].label}. Your modules are in {COHORTS[year].label}.
          </p>
          <div className="mod-peek__actions">
            <Button size="sm" variant="ghost" leadingIcon={ArrowCounterClockwise} onClick={() => setPeek(null, { replace: true })}>
              Back to {COHORTS[year].label}
            </Button>
            <Button size="sm" onClick={() => setYear(viewYear)}>
              Make {COHORTS[viewYear].label} my year
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mod-toc-wrap">
        <ol className={cx('mod-toc', `mod-toc--y${viewYear}`)} role="list" aria-label={`${COHORTS[viewYear].label} modules`}>
          {rows.map((r) => (
            <ModuleRow
              key={r.module.id}
              module={r.module}
              progress={r.progress}
              progressReady={ready}
              exam={r.exam}
              showExam={showExam}
              showProgress={showProgress}
            />
          ))}
        </ol>
      </div>
      <ImportProgressPrompt />
    </Page>
  );
}
