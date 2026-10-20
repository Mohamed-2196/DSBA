// /modules/:moduleId: header (a band with the code, name, year, next exam and quick actions; on phones one line and a
// row of actions, so the tabs are on the first screen) and URL-driven tabs, which stay under the top bar as you scroll:
// ?tab=overview|lessons|files|discussion. A lesson has its own address, /modules/:moduleId/lessons/:lessonId (the
// Lessons tab with that lesson on screen); ?tab=lessons opens where the student left off.
// The header comes from the catalogue at once; chapters, videos and shelves load with GET /modules/{id}.
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ModuleDetail, ModuleSummary } from '../../api/types';
import { BREAKPOINTS, COHORTS, useDocumentTitle, useMediaQuery, useYear } from '../../state';
import { useAuth } from '../../auth';
import { useModules } from '../../state/modules';
import {
  Badge,
  Button,
  CohortBadge,
  Deskmate,
  EmptyState,
  ErrorBoundary,
  Icon,
  Page,
  Panel,
  QueryError,
  Skeleton,
  TabPanel,
  Tabs,
  countOf,
  glyph,
} from '../../ui';
import { PlanRevision } from '../board/public';
import { ModuleThreads, Prose } from '../forum/public';
import { ModuleFiles, useLibraryUpload } from '../library/public';
import { useModule } from './api';
import { useModuleExam, type ExamInfo } from './exams';
import { ImportProgressPrompt } from './ImportProgressPrompt';
import { LessonsTab } from './LessonsTab';
import { isModuleTab, lessonHref, moduleTabOn, type ModuleTab } from './lessons';
import { ModuleOverview } from './ModuleOverview';
import { computeResumePoint, findLesson, useProgress, type ResumeKind, type ResumePoint } from './progress';
import { resourceSummary, shelfHash, shelfWithFiles } from './resources';
import { SharedNotes } from './SharedNotes';
import { SuggestVideo } from './suggestions/SuggestVideo';
import './ModulePage.css';

const RESUME_LABEL: Record<ResumeKind, string> = {
  resume: 'Resume lesson',
  next: 'Continue',
  start: 'Start lesson 1',
  done: 'Watch again',
};
/** Phones, upright or on their side (ModulePage.css has the same query). */
const COMPACT_HEADER = `${BREAKPOINTS.mobile}, (max-height: 499px)`;
/** The resume button's label on a phone's row of three. */
const RESUME_SHORT: Record<ResumeKind, string> = {
  resume: 'Resume',
  next: 'Continue',
  start: 'Lessons',
  done: 'Lessons',
};

function ModuleHeader({
  summary: m,
  detail,
  resume,
  exam,
  onOpenLesson,
}: {
  summary: ModuleSummary;
  detail: ModuleDetail | undefined;
  resume: ResumePoint | null;
  exam: ExamInfo | null;
  onOpenLesson: (c: number, v: number) => void;
}) {
  const { year } = useYear();
  const { featureOn } = useAuth();
  // Phones: one line for the module, the description behind "About this module" and one row of actions, so the
  // tabs are on the first screen (UX review UX-69).
  const phone = useMediaQuery(COMPACT_HEADER);
  const [about, setAbout] = useState(false);
  const aboutId = useId();
  const plan = featureOn('board') ? (
    <PlanRevision
      moduleId={m.id}
      moduleName={m.unitCode || m.shortName || m.name}
      examDate={exam?.event.date ?? null}
      short={phone}
      className="mod-head__action"
    />
  ) : null;
  // The Files tab, at its past papers and its books.
  const pastPapers = shelfWithFiles(detail, 'past-paper')
    ? `/modules/${m.id}?tab=files#${shelfHash('past-paper')}`
    : null;
  const studyGuide = shelfWithFiles(detail, 'course-materials')
    ? `/modules/${m.id}?tab=files#${shelfHash('course-materials')}`
    : null;
  const backTo = year === m.year ? '/modules' : `/modules?year=${m.year}`;

  const counts = [
    m.lessonCount
      ? `${countOf(m.chapterCount, 'chapter')}, ${countOf(m.lessonCount, 'video lesson')}`
      : detail
        ? resourceSummary(detail)
        : null,
    m.libraryCount ? `${countOf(m.libraryCount, 'file')} in the library` : null,
  ].filter(Boolean);

  const lessonsAction = m.lessonCount ? (
    resume ? (
      <Button
        variant="primary"
        leadingIcon={<Icon glyph={glyph.play} />}
        onClick={() => onOpenLesson(resume.c, resume.v)}
        className="mod-head__action"
      >
        {phone ? RESUME_SHORT[resume.kind] : RESUME_LABEL[resume.kind]}
      </Button>
    ) : (
      <Skeleton width={phone ? '100%' : 150} height={phone ? 44 : 40} radius={10} />
    )
  ) : studyGuide ? (
    <Button variant="primary" to={studyGuide} className="mod-head__action">
      Study guide
    </Button>
  ) : null;
  const actions = (
    <div className="mod-head__actions">
      {lessonsAction}
      {pastPapers ? (
        <Button to={pastPapers} className="mod-head__action">
          Past papers
        </Button>
      ) : null}
      {plan}
    </div>
  );

  return (
    <header className={`mod-head mod-head--y${m.year}`} data-hub="module-header">
      <div className="mod-head__top">
        <Link to={backTo} className="mod-head__back">
          <Icon glyph={glyph.chevronLeft} />
          {COHORTS[m.year].label} modules
        </Link>
        {phone && m.description ? (
          <button
            type="button"
            className="mod-head__about"
            aria-expanded={about}
            aria-controls={aboutId}
            onClick={() => setAbout((open) => !open)}
          >
            About this module
            <Icon glyph={glyph.chevronDown} className="mod-head__about-caret" />
          </button>
        ) : null}
      </div>
      {/* The module's band, in the Modules colour: the code set big in mono, the name, then its year, exam and
          actions; Binder at the end in the module's year colour. */}
      <div className="mod-head__band" data-section="modules">
        <div className="mod-head__band-text">
          <h1 className="mod-head__title">
            {m.unitCode ? <span className="mod-head__code u-code">{m.unitCode} </span> : null}
            <span className="mod-head__name">{phone && m.unitCode ? m.shortName || m.name : m.name}</span>
          </h1>
          {m.description ? (
            <div className="mod-head__desc" id={aboutId} hidden={phone && !about}>
              <Prose text={m.description} />
            </div>
          ) : null}
          <div className="mod-head__meta">
            <CohortBadge year={m.year} />
            {exam ? (
              <Badge tone="exam" icon={<Icon glyph={glyph.calendar} />} className="mod-head__exam">
                Exam {exam.weekdayDate}, {exam.relative}
              </Badge>
            ) : null}
            {counts.length && !phone ? <span className="mod-head__counts">{counts.join(', ')}</span> : null}
          </div>
          {phone ? null : actions}
        </div>
        <span className="mod-head__mate">
          <Deskmate mate="binder" size={104} cover={`var(--y${m.year})`} />
        </span>
      </div>
      {phone ? actions : null}
    </header>
  );
}

function PanelSkeleton() {
  return (
    <div className="mod-loading" aria-hidden="true">
      <Skeleton height={320} radius={16} />
      <Skeleton lines={3} />
    </div>
  );
}

/**
 * The header on the Lessons tab: one line (back to the year's modules, then the module's code and name, a link to
 * its overview), so the video is on a phone's first screen.
 */
function LessonsHeader({ summary: m }: { summary: ModuleSummary }) {
  const { year } = useYear();
  const backTo = year === m.year ? '/modules' : `/modules?year=${m.year}`;
  return (
    <header className={`mod-head mod-head--compact mod-head--y${m.year}`} data-hub="module-header">
      <Link to={backTo} className="mod-head__back">
        <Icon glyph={glyph.chevronLeft} />
        <span className="mod-head__back-label">{COHORTS[m.year].label} modules</span>
      </Link>
      <h1 className="mod-head__line">
        <Link to={`/modules/${m.id}`} className="mod-head__line-link">
          {m.unitCode ? <span className="mod-head__line-code u-code">{m.unitCode}</span> : null}
          <span className="mod-head__line-name">{m.unitCode ? m.shortName || m.name : m.name}</span>
        </Link>
      </h1>
    </header>
  );
}

function ModuleView({ summary: m, lessonId }: { summary: ModuleSummary; lessonId: string | null }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { featureOn } = useAuth();
  const rawTab = lessonId ? 'lessons' : params.get('tab');
  const tab: ModuleTab = isModuleTab(rawTab) && moduleTabOn(rawTab, featureOn) ? rawTab : 'overview';
  const detailQ = useModule(m.id);
  const detail = detailQ.data;
  const progressApi = useProgress();
  const { state, ready, tracking } = progressApi;
  const exam = useModuleExam(m.id);
  const resume = detail && ready ? computeResumePoint(state, detail) : null;
  // Contributing means uploading to the library (decision D6), with this module chosen.
  const upload = useLibraryUpload({ moduleId: m.id, year: m.year });

  const go = useCallback((to: string) => navigate(to, { replace: true }), [navigate]);
  const setTab = useCallback(
    (id: string, hash?: string) =>
      go(id === 'overview' ? `/modules/${m.id}` : `/modules/${m.id}?tab=${id}${hash ? `#${hash}` : ''}`),
    [go, m.id],
  );
  const selectLesson = useCallback(
    (c: number, v: number) => {
      const id = detail?.chapters[c]?.videos[v]?.id;
      if (id) go(lessonHref(m.id, id));
    },
    [detail, go, m.id],
  );
  const openLesson = useCallback(
    (c: number, v: number) => {
      selectLesson(c, v);
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [selectLesson],
  );

  // The lesson on screen: from the URL, else where the student left off, else the first one.
  const fromUrl = findLesson(detail, lessonId);
  const selection = fromUrl ?? (resume ? { c: resume.c, v: resume.v } : null);

  // Give the resolved lesson its address, so marking it watched doesn't move the player along.
  const pinC = selection?.c;
  const pinV = selection?.v;
  useEffect(() => {
    if (tab === 'lessons' && !fromUrl && pinC != null && pinV != null) selectLesson(pinC, pinV);
  }, [tab, fromUrl, pinC, pinV, selectLesson]);

  const tabs = (
    [
      { id: 'overview', label: 'Overview' },
      { id: 'lessons', label: 'Lessons', count: m.lessonCount || null },
      { id: 'files', label: 'Files', count: m.libraryCount || null },
      { id: 'discussion', label: 'Discussion' },
    ] as const
  ).filter((t) => moduleTabOn(t.id, featureOn));

  let detailProblem: ReactNode = null;
  if (detailQ.isError) {
    detailProblem = (
      <QueryError
        error={detailQ.error}
        title="This module’s lessons didn’t load"
        onRetry={() => void detailQ.refetch()}
        retrying={detailQ.isFetching}
      />
    );
  }

  let lessonsPanel: ReactNode;
  if (detailProblem) lessonsPanel = detailProblem;
  else if (!detail || (m.lessonCount > 0 && !ready)) lessonsPanel = <PanelSkeleton />;
  else if (selection)
    lessonsPanel = <LessonsTab module={detail} selection={selection} progress={progressApi} onSelect={selectLesson} />;
  else {
    lessonsPanel = (
      <Panel padding="none">
        <EmptyState
          mate="binder"
          title={`No video lessons for ${m.unitCode || m.name} yet`}
          body="The study guide and past papers are in Overview. Have notes or a past paper for this module? Share them in the library."
          action={
            <>
              <Button onClick={() => setTab('overview')}>See resources</Button>
              {upload.start ? (
                <Button variant="primary" leadingIcon={<Icon glyph={glyph.upload} />} onClick={upload.start}>
                  Upload a file
                </Button>
              ) : null}
            </>
          }
        />
      </Panel>
    );
  }

  return (
    <Page className={`mod-page mod-page--y${m.year}`}>
      {tab === 'lessons' ? (
        <LessonsHeader summary={m} />
      ) : (
        <ModuleHeader summary={m} detail={detail} resume={resume} exam={exam} onOpenLesson={openLesson} />
      )}

      <Tabs
        idBase="module"
        label="Module sections"
        className="mod-tabs"
        data-hub="module-tabs"
        tabs={tabs}
        value={tab}
        onChange={setTab}
      />

      <div className="mod-panels">
        <TabPanel idBase="module" id="overview" value={tab}>
          {detailProblem ??
            (detail ? (
              <ModuleOverview
                module={detail}
                state={state}
                tracking={tracking}
                resume={resume}
                libraryCount={m.libraryCount}
                onOpenLesson={openLesson}
                onTab={setTab}
                onUpload={upload.start}
              />
            ) : (
              <PanelSkeleton />
            ))}
        </TabPanel>
        <TabPanel idBase="module" id="lessons" value={tab}>
          {lessonsPanel}
          {detail && featureOn('modules.video-suggestions') ? (
            <ErrorBoundary name="SuggestVideo" resetKey={m.id}>
              <SuggestVideo module={detail} />
            </ErrorBoundary>
          ) : null}
        </TabPanel>
        {moduleTabOn('files', featureOn) ? (
          <TabPanel idBase="module" id="files" value={tab}>
            {featureOn('notes.share') ? (
              <ErrorBoundary name="SharedNotes" resetKey={m.id}>
                <SharedNotes moduleId={m.id} />
              </ErrorBoundary>
            ) : null}
            <ErrorBoundary name="ModuleFiles" resetKey={m.id}>
              <ModuleFiles moduleId={m.id} />
            </ErrorBoundary>
          </TabPanel>
        ) : null}
        {moduleTabOn('discussion', featureOn) ? (
          <TabPanel idBase="module" id="discussion" value={tab}>
            <ErrorBoundary name="ModuleThreads" resetKey={m.id}>
              <ModuleThreads moduleId={m.id} />
            </ErrorBoundary>
          </TabPanel>
        ) : null}
      </div>
      <ImportProgressPrompt />
      {upload.dialog}
    </Page>
  );
}

export default function ModulePage() {
  const { moduleId = '', lessonId = null } = useParams();
  const { pathname, search } = useLocation();
  const { getModule, getModuleByUnitCode } = useModules();
  // A unit code ('/modules/ST2133') works as an address too, and leads to the module's own one.
  const m = getModule(moduleId) ?? getModuleByUnitCode(moduleId.toUpperCase());
  useDocumentTitle(m ? (m.unitCode ? `${m.unitCode} ${m.name}` : m.name) : 'Module not found');

  if (!m) {
    return (
      <Page>
        <Panel padding="none">
          <EmptyState
            icon={<Icon glyph={glyph.search} />}
            titleAs="h1"
            title="We couldn’t find that module"
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
  if (m.id !== moduleId)
    return <Navigate replace to={`/modules/${m.id}${pathname.slice(`/modules/${moduleId}`.length)}${search}`} />;
  return <ModuleView key={m.id} summary={m} lessonId={lessonId} />;
}
