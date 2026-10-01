// /modules/:moduleId — header (code, name, year, exam countdown, progress + quick actions) and
// URL-driven tabs: ?tab=overview|lessons|files|discussion, lesson via &chapter=<i>&video=<j> (0-based).
import { useCallback, useEffect, useMemo } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowSquareOut, BookOpenText, CalendarBlank, CaretLeft, ChatsCircle, Files, Info, MagnifyingGlass, Play, PlayCircle } from '@phosphor-icons/react';
import { getModule, getModuleStats } from '../../data/modules.js';
import { CONTRIBUTE_URL } from '../../data/people.js';
import { COHORTS, cohortColor, useDocumentTitle, useYear } from '../../state';
import { Badge, Button, CohortBadge, EmptyState, ErrorBoundary, ModuleIcon, Page, Panel, ProgressRing, TabPanel, Tabs } from '../../ui';
import { ModuleFiles, getFilesForModule } from '../library/public.js';
import { ModuleThreads } from '../forum/public.js';
import { computeModuleProgress, computeResumePoint, isValidLesson, useLessonProgress } from './progress.js';
import { MODULE_TABS, chapterPosition, examFor, indexParam } from './lessons.js';
import { resourceSummary } from './resources.js';
import { ModuleOverview } from './ModuleOverview.jsx';
import { LessonsTab } from './LessonsTab.jsx';
import './ModulePage.css';

const RESUME_LABEL = { resume: 'Resume lesson', next: 'Continue', start: 'Start lesson 1', done: 'Watch again' };

/** Library files for a module via the library's public API (never let another feature break this page). */
function useModuleFiles(moduleId) {
  return useMemo(() => {
    try {
      const files = getFilesForModule(moduleId);
      return Array.isArray(files) ? files : [];
    } catch {
      return [];
    }
  }, [moduleId]);
}

function ModuleHeader({ module: m, progress, resume, exam, onOpenLesson }) {
  const { year } = useYear();
  const stats = getModuleStats(m);
  const r = m.resources;
  const pastPapers = r.vle || r.olderExams;
  const backTo = year === m.year ? '/modules' : `/modules?year=${m.year}`;
  const resumeChapter = resume ? m.chapters[resume.c] : null;

  let resumeNote = null;
  if (resume?.kind === 'done') resumeNote = 'You have watched every video.';
  else if (resume?.kind === 'start') resumeNote = 'Start with chapter 1.';
  else if (resume) resumeNote = `Up next: ${chapterPosition(resume.c, resumeChapter.videos[resume.v], resume.v, resumeChapter.videos.length).toLowerCase()}.`;

  return (
    <header className={`mod-head mod-head--y${m.year}`} data-pulse="module-header">
      <Link to={backTo} className="mod-head__back">
        <CaretLeft weight="bold" aria-hidden="true" />
        {COHORTS[m.year].label} modules
      </Link>
      <div className="mod-head__grid">
        <div className="mod-head__main">
          <h1 className="mod-head__title">
            {m.unitCode ? (
              <span className="mod-head__code u-code">{m.unitCode}</span>
            ) : (
              <span className="mod-head__plate" aria-hidden="true">
                <ModuleIcon moduleId={m.id} weight="duotone" />
              </span>
            )}
            <span className="mod-head__name">{m.name}</span>
          </h1>
          <p className="mod-head__desc">{m.description}</p>
          <div className="mod-head__meta">
            <CohortBadge year={m.year} />
            {exam ? (
              <Badge tone="alert" icon={CalendarBlank}>
                Exam {exam.weekdayDate}, {exam.relative}
              </Badge>
            ) : null}
            <span className="mod-head__counts">
              {stats.videos ? `${stats.chapters} ${stats.chapters === 1 ? 'chapter' : 'chapters'}, ${stats.videos} video ${stats.videos === 1 ? 'lesson' : 'lessons'}` : resourceSummary(m)}
              {stats.notes ? `, ${stats.notes} ${stats.notes === 1 ? 'student note' : 'student notes'}` : ''}
            </span>
          </div>
        </div>

        <Panel as="div" padding="none" className="mod-head__side">
          {stats.videos ? (
            <>
              <div className="mod-head__progress">
                <ProgressRing value={progress.pct} size={64} stroke={6} color={progress.pct === 100 ? 'var(--signal)' : cohortColor(m.year)} label="Lessons watched" />
                <div className="mod-head__progress-text">
                  <p className="mod-head__progress-num">
                    <b className="u-tabular">{progress.watched}</b> of <span className="u-tabular">{progress.total}</span> lessons watched
                  </p>
                  {resumeNote ? <p className="mod-head__progress-note">{resumeNote}</p> : null}
                </div>
              </div>
              <div className="mod-head__actions">
                <Button variant="primary" leadingIcon={Play} onClick={() => onOpenLesson(resume.c, resume.v)}>
                  {RESUME_LABEL[resume.kind]}
                </Button>
                {pastPapers ? (
                  <Button href={pastPapers} trailingIcon={ArrowSquareOut} aria-label="Past papers (opens in a new tab)">
                    Past papers
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="mod-head__progress">
                <span className="mod-head__nolessons" aria-hidden="true">
                  <BookOpenText weight="duotone" />
                </span>
                <div className="mod-head__progress-text">
                  <p className="mod-head__progress-num">Start with the study guide</p>
                  <p className="mod-head__progress-note">There are no video lessons for this module yet.</p>
                </div>
              </div>
              <div className="mod-head__actions">
                {r.materials ? (
                  <Button variant="primary" href={r.materials} trailingIcon={ArrowSquareOut} aria-label="Study guide (opens in a new tab)">
                    Study guide
                  </Button>
                ) : null}
                {pastPapers ? (
                  <Button href={pastPapers} trailingIcon={ArrowSquareOut} aria-label="Past papers (opens in a new tab)">
                    Past papers
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </Panel>
      </div>
    </header>
  );
}

function ModuleView({ module: m }) {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab = MODULE_TABS.includes(rawTab) ? rawTab : 'overview';
  const progressApi = useLessonProgress();
  const { state } = progressApi;
  const stats = getModuleStats(m);
  const progress = computeModuleProgress(state, m);
  const resume = computeResumePoint(state, m);
  const exam = useMemo(() => examFor(m.id), [m.id]);
  const files = useModuleFiles(m.id);

  const update = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          Object.entries(patch).forEach(([k, val]) => (val == null ? p.delete(k) : p.set(k, String(val))));
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const setTab = useCallback(
    (id) => update(id === 'lessons' ? { tab: 'lessons' } : { tab: id === 'overview' ? null : id, chapter: null, video: null }),
    [update],
  );
  const openLesson = useCallback(
    (c, v) => {
      update({ tab: 'lessons', chapter: c, video: v });
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [update],
  );
  const selectLesson = useCallback((c, v) => update({ tab: 'lessons', chapter: c, video: v }), [update]);

  // The lesson on screen: from the URL, else where the student left off, else the first one.
  const cParam = indexParam(params.get('chapter'));
  const vParam = indexParam(params.get('video'));
  const fromUrl = cParam != null && isValidLesson(m, cParam, vParam ?? 0);
  const selection = fromUrl ? { c: cParam, v: vParam ?? 0 } : resume ? { c: resume.c, v: resume.v } : null;

  // Pin the resolved lesson in the URL, so marking it watched doesn't move the player along.
  const pinC = selection?.c;
  const pinV = selection?.v;
  useEffect(() => {
    if (tab === 'lessons' && !fromUrl && pinC != null) update({ chapter: pinC, video: pinV });
  }, [tab, fromUrl, pinC, pinV, update]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'lessons', label: 'Lessons', icon: PlayCircle, count: stats.videos || null },
    { id: 'files', label: 'Files', icon: Files, count: files.length || null },
    { id: 'discussion', label: 'Discussion', icon: ChatsCircle },
  ];

  return (
    <Page className={`mod-page mod-page--y${m.year}`}>
      <ModuleHeader module={m} progress={progress} resume={resume} exam={exam} onOpenLesson={openLesson} />

      <Tabs idBase="module" label="Module sections" className="mod-tabs" data-pulse="module-tabs" tabs={tabs} value={tab} onChange={setTab} />

      <div className="mod-panels">
        <TabPanel idBase="module" id="overview" value={tab}>
          <ModuleOverview module={m} state={state} resume={resume} exam={exam} files={files} onOpenLesson={openLesson} onTab={setTab} />
        </TabPanel>
        <TabPanel idBase="module" id="lessons" value={tab}>
          {selection ? (
            <LessonsTab module={m} selection={selection} progress={progressApi} onSelect={selectLesson} />
          ) : (
            <Panel padding="none">
              <EmptyState
                icon={PlayCircle}
                title={`No video lessons for ${m.unitCode || m.name} yet`}
                body="The study guide and past papers are in Overview. Know a good playlist for this module? Suggest it and it can be added here."
                action={
                  <>
                    <Button onClick={() => setTab('overview')}>See resources</Button>
                    <Button variant="primary" href={CONTRIBUTE_URL} trailingIcon={ArrowSquareOut}>
                      Suggest a playlist
                    </Button>
                  </>
                }
              />
            </Panel>
          )}
        </TabPanel>
        <TabPanel idBase="module" id="files" value={tab}>
          <ErrorBoundary name="ModuleFiles" resetKey={m.id}>
            <ModuleFiles moduleId={m.id} />
          </ErrorBoundary>
        </TabPanel>
        <TabPanel idBase="module" id="discussion" value={tab}>
          <ErrorBoundary name="ModuleThreads" resetKey={m.id}>
            <ModuleThreads moduleId={m.id} />
          </ErrorBoundary>
        </TabPanel>
      </div>
    </Page>
  );
}

export default function ModulePage() {
  const { moduleId } = useParams();
  const { search } = useLocation();
  const m = getModule(moduleId);
  useDocumentTitle(m ? (m.unitCode ? `${m.unitCode} ${m.name}` : m.name) : 'Module not found');

  if (!m) {
    return (
      <Page>
        <Panel padding="none">
          <EmptyState
            icon={MagnifyingGlass}
            title="We couldn't find that module"
            body="It may have been renamed. Pick it from the module list instead."
            action={
              <Button to="/modules" variant="primary">
                See all modules
              </Button>
            }
          />
        </Panel>
      </Page>
    );
  }
  // v1 codes (e.g. /modules/Business) resolve to the v2 id.
  if (m.id !== moduleId) return <Navigate replace to={`/modules/${m.id}${search}`} />;
  return <ModuleView key={m.id} module={m} />;
}
