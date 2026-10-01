// /modules — the year's modules as a contents page: a spine of big unit codes (Year 3 modules have
// no code in v1, so a plate with the module's icon takes the code's place), each row with name,
// description, counts, next exam and lesson progress. Synced with the global year; the segmented
// control lets a student peek at another year without changing theirs (?year=3).
import { useEffect, useId, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowCounterClockwise, CalendarBlank, CaretRight } from '@phosphor-icons/react';
import { getModuleStats, getModulesForYear } from '../../data/modules.js';
import { COHORTS, YEARS, cohortColor, normalizeYear, useDocumentTitle, useQueryParam, useYear } from '../../state';
import { Button, CohortBadge, ModuleIcon, Page, PageHeader, ProgressRing, SegmentedControl, cx } from '../../ui';
import { computeModuleProgress, useLessonProgress } from './progress.js';
import { examFor } from './lessons.js';
import { resourceSummary } from './resources.js';
import './ModulesPage.css';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ModuleRow({ module: m, progress, exam, showExam, showProgress }) {
  const uid = useId();
  const stats = getModuleStats(m);
  const hasLessons = stats.videos > 0;
  const described = [`${uid}-desc`, `${uid}-counts`, showExam && `${uid}-exam`, showProgress && `${uid}-prog`].filter(Boolean).join(' ');
  return (
    <li className="mod-toc__item">
      <Link
        to={`/modules/${m.id}`}
        className={cx('mod-row', `mod-row--y${m.year}`, !showExam && 'mod-row--no-exam', !showProgress && 'mod-row--no-prog')}
        data-pulse="module-tile"
        data-module-id={m.id}
        aria-labelledby={`${uid}-anchor ${uid}-name`}
        aria-describedby={described}
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
          <span className="mod-row__name" id={`${uid}-name`}>{m.name}</span>
          <span className="mod-row__desc" id={`${uid}-desc`}>{m.description}</span>
          <span className="mod-row__counts" id={`${uid}-counts`}>
            {hasLessons ? (
              <>
                <span><b className="u-tabular">{stats.chapters}</b> {stats.chapters === 1 ? 'chapter' : 'chapters'}</span>
                <span><b className="u-tabular">{stats.videos}</b> {stats.videos === 1 ? 'video lesson' : 'video lessons'}</span>
              </>
            ) : (
              <span>{resourceSummary(m)}</span>
            )}
            {stats.notes ? <span><b className="u-tabular">{stats.notes}</b> {stats.notes === 1 ? 'student note' : 'student notes'}</span> : null}
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
  const [peek, setPeek] = useQueryParam('year', null);
  const viewYear = normalizeYear(peek) ?? activeYear;
  const peeking = year != null && viewYear !== year;
  const { state } = useLessonProgress();
  useDocumentTitle(`${COHORTS[viewYear].label} modules`);

  // Follow the global year: when it changes in the rail, drop any local peek.
  const lastYear = useRef(year);
  useEffect(() => {
    if (lastYear.current === year) return;
    lastYear.current = year;
    setPeek(null, { replace: true });
  }, [year, setPeek]);

  const rows = useMemo(() => {
    const now = Date.now();
    return getModulesForYear(viewYear).map((m) => ({
      module: m,
      progress: computeModuleProgress(state, m),
      exam: examFor(m.id, now),
    }));
  }, [viewYear, state]);

  const totals = rows.reduce(
    (acc, r) => ({ videos: acc.videos + r.progress.total, watched: acc.watched + r.progress.watched }),
    { videos: 0, watched: 0 },
  );
  const nextExam = rows.filter((r) => r.exam).sort((a, b) => a.exam.days - b.exam.days)[0];
  // Columns that would say "none" on every row are left out (Year 3 has no exam dates or videos in v1).
  const showExam = rows.some((r) => r.exam);
  const showProgress = totals.videos > 0;

  return (
    <Page className="mod-index">
      <PageHeader
        title="Modules"
        description={`Books, past papers, students' notes and video lessons for every ${COHORTS[viewYear].label} module.`}
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
                <span>
                  <b className="u-tabular">{totals.watched}</b> of <b className="u-tabular">{totals.videos}</b> lessons watched
                </span>
              </span>
            ) : (
              <span className="mod-index__fact">Study guides and past papers; no video lessons yet</span>
            )}
            {nextExam ? (
              <span className="mod-index__fact mod-index__fact--exam">
                <CalendarBlank aria-hidden="true" weight="bold" />
                Next exam {nextExam.module.unitCode || nextExam.module.shortName}, {nextExam.exam.weekdayDate}
              </span>
            ) : (
              <span className="mod-index__fact">No exam dates yet</span>
            )}
          </>
        }
      />

      {peeking ? (
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
            <ModuleRow key={r.module.id} module={r.module} progress={r.progress} exam={r.exam} showExam={showExam} showProgress={showProgress} />
          ))}
        </ol>
      </div>
    </Page>
  );
}
