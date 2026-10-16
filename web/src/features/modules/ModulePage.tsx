// /modules/:moduleId: header (code, name, year, next exam, progress and quick actions) and URL-driven tabs:
// ?tab=overview|lessons|files|discussion. A lesson has its own address, /modules/:moduleId/lessons/:lessonId (the
// Lessons tab with that lesson on screen); ?tab=lessons opens where the student left off.
// The header comes from the catalogue at once; chapters, videos and shelves load with GET /modules/{id}.
import { BookOpenText, CalendarBlank, CaretLeft, ChatsCircle, Files, Info, MagnifyingGlass, Play, PlayCircle, UploadSimple } from '@phosphor-icons/react';
import { useCallback, useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ModuleDetail, ModuleSummary } from '../../api/types';
import { COHORTS, cohortColor, useDocumentTitle, useYear } from '../../state';
import { useAuth } from '../../auth';
import { useModules } from '../../state/modules';
import { Badge, Button, CohortBadge, EmptyState, ErrorBoundary, ModuleArt, ModuleIcon, Page, Panel, ProgressRing, QueryError, Skeleton, TabPanel, Tabs, countOf, moduleArtSrc } from '../../ui';
import { PlanRevision } from '../board/public';
import { ModuleThreads, Prose } from '../forum/public';
import { ModuleFiles, useLibraryUpload } from '../library/public';
import { useModule } from './api';
import { useModuleExam, type ExamInfo } from './exams';
import { ImportProgressPrompt } from './ImportProgressPrompt';
import { LessonsTab } from './LessonsTab';
import { chapterPosition, isModuleTab, lessonHref, moduleTabOn, type ModuleTab } from './lessons';
import { ModuleOverview } from './ModuleOverview';
import { computeModuleProgress, computeResumePoint, findLesson, summaryProgress, useProgress, type Fraction, type ResumeKind, type ResumePoint } from './progress';
import { resourceSummary, shelfHash, shelfWithFiles } from './resources';
import { SuggestVideo } from './suggestions/SuggestVideo';
import './ModulePage.css';

const RESUME_LABEL: Record<ResumeKind, string> = { resume: 'Resume lesson', next: 'Continue', start: 'Start lesson 1', done: 'Watch again' };

function ModuleHeader({
  summary: m,
  detail,
  progress,
  progressReady,
  tracking,
  resume,
  exam,
  onOpenLesson,
}: {
  summary: ModuleSummary;
  detail: ModuleDetail | undefined;
  progress: Fraction;
  progressReady: boolean;
  tracking: boolean;
  resume: ResumePoint | null;
  exam: ExamInfo | null;
  onOpenLesson: (c: number, v: number) => void;
}) {
  const { year } = useYear();
  const { featureOn } = useAuth();
  const plan = featureOn('board') ? (
    <PlanRevision moduleId={m.id} moduleName={m.unitCode || m.shortName || m.name} examDate={exam?.event.date ?? null} className="mod-head__action" />
  ) : null;
  // The Files tab, at its past papers and its books.
  const pastPapers = shelfWithFiles(detail, 'past-paper') ? `/modules/${m.id}?tab=files#${shelfHash('past-paper')}` : null;
  const studyGuide = shelfWithFiles(detail, 'course-materials') ? `/modules/${m.id}?tab=files#${shelfHash('course-materials')}` : null;
  const backTo = year === m.year ? '/modules' : `/modules?year=${m.year}`;
  const resumeChapter = resume && detail ? detail.chapters[resume.c] : null;
  const hasArt = moduleArtSrc(m.id, m.artUrl) != null;

  let resumeNote: string | null = null;
  if (resume?.kind === 'done') resumeNote = 'You have watched every video.';
  else if (resume?.kind === 'start') resumeNote = 'Start with chapter 1.';
  else if (resume && resumeChapter) {
    resumeNote = `Up next: ${chapterPosition(resume.c, resumeChapter.videos[resume.v], resume.v, resumeChapter.videos.length).toLowerCase()}.`;
  }

  const counts = [
    m.lessonCount ? `${countOf(m.chapterCount, 'chapter')}, ${countOf(m.lessonCount, 'video lesson')}` : detail ? resourceSummary(detail) : null,
    m.libraryCount ? `${countOf(m.libraryCount, 'file')} in the library` : null,
  ].filter(Boolean);

  return (
    <header className={`mod-head mod-head--y${m.year}`} data-hub="module-header">
      <Link to={backTo} className="mod-head__back">
        <CaretLeft weight="bold" aria-hidden="true" />
        {COHORTS[m.year].label} modules
      </Link>
      <div className="mod-head__grid">
        <div className="mod-head__main">
          <h1 className="mod-head__title">
            {hasArt ? (
              <ModuleArt moduleId={m.id} artUrl={m.artUrl} className="mod-head__art" />
            ) : m.unitCode ? (
              <span className="mod-head__code u-code">{m.unitCode}</span>
            ) : (
              <span className="mod-head__plate" aria-hidden="true">
                <ModuleIcon moduleId={m.id} weight="duotone" />
              </span>
            )}
            <span className="mod-head__heading">
              {hasArt && m.unitCode ? <span className="mod-head__label u-code">{m.unitCode} </span> : null}
              <span className="mod-head__name">{m.name}</span>
            </span>
          </h1>
          {m.description ? (
            <div className="mod-head__desc">
              <Prose text={m.description} />
            </div>
          ) : null}
          <div className="mod-head__meta">
            <CohortBadge year={m.year} />
            {exam ? (
              <Badge tone="alert" icon={CalendarBlank}>
                Exam {exam.weekdayDate}, {exam.relative}
              </Badge>
            ) : null}
            {counts.length ? <span className="mod-head__counts">{counts.join(', ')}</span> : null}
          </div>
        </div>

        <Panel as="div" padding="none" className="mod-head__side">
          {m.lessonCount ? (
            <>
              {tracking ? (
                <div className="mod-head__progress">
                  <ProgressRing
                    value={progressReady ? progress.pct : 0}
                    size={64}
                    stroke={6}
                    color={progress.pct === 100 ? 'var(--signal)' : cohortColor(m.year)}
                    label="Lessons watched"
                  />
                  <div className="mod-head__progress-text">
                    {progressReady ? (
                      <p className="mod-head__progress-num">
                        <b className="u-tabular">{progress.watched}</b> of <span className="u-tabular">{progress.total}</span> lessons watched
                      </p>
                    ) : (
                      <Skeleton width={180} height={18} />
                    )}
                    {resumeNote ? <p className="mod-head__progress-note">{resumeNote}</p> : null}
                  </div>
                </div>
              ) : (
                <div className="mod-head__progress">
                  <span className="mod-head__nolessons" aria-hidden="true">
                    <PlayCircle weight="duotone" />
                  </span>
                  <div className="mod-head__progress-text">
                    <p className="mod-head__progress-num">{countOf(m.lessonCount, 'video lesson')}</p>
                    <p className="mod-head__progress-note">Start with chapter 1, or pick any lesson.</p>
                  </div>
                </div>
              )}
              <div className="mod-head__actions">
                {resume ? (
                  <Button variant="primary" leadingIcon={Play} onClick={() => onOpenLesson(resume.c, resume.v)} className="mod-head__action">
                    {RESUME_LABEL[resume.kind]}
                  </Button>
                ) : (
                  <Skeleton width={150} height={40} radius={10} />
                )}
                {pastPapers ? (
                  <Button to={pastPapers} className="mod-head__action">
                    Past papers
                  </Button>
                ) : null}
                {plan}
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
                {studyGuide ? (
                  <Button variant="primary" to={studyGuide} className="mod-head__action">
                    Study guide
                  </Button>
                ) : null}
                {pastPapers ? (
                  <Button to={pastPapers} className="mod-head__action">
                    Past papers
                  </Button>
                ) : null}
                {plan}
              </div>
            </>
          )}
        </Panel>
      </div>
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
  const progress = detail ? computeModuleProgress(state, detail) : summaryProgress(state, m.id, m.lessonCount);
  const resume = detail && ready ? computeResumePoint(state, detail) : null;
  // Contributing means uploading to the library (decision D6), with this module chosen.
  const upload = useLibraryUpload({ moduleId: m.id, year: m.year });

  const go = useCallback((to: string) => navigate(to, { replace: true }), [navigate]);
  const setTab = useCallback(
    (id: string, hash?: string) => go(id === 'overview' ? `/modules/${m.id}` : `/modules/${m.id}?tab=${id}${hash ? `#${hash}` : ''}`),
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
      { id: 'overview', label: 'Overview', icon: Info },
      { id: 'lessons', label: 'Lessons', icon: PlayCircle, count: m.lessonCount || null },
      { id: 'files', label: 'Files', icon: Files, count: m.libraryCount || null },
      { id: 'discussion', label: 'Discussion', icon: ChatsCircle },
    ] as const
  ).filter((t) => moduleTabOn(t.id, featureOn));

  let detailProblem: ReactNode = null;
  if (detailQ.isError) {
    detailProblem = (
      <QueryError error={detailQ.error} title="This module’s lessons didn’t load" onRetry={() => void detailQ.refetch()} retrying={detailQ.isFetching} />
    );
  }

  let lessonsPanel: ReactNode;
  if (detailProblem) lessonsPanel = detailProblem;
  else if (!detail || (m.lessonCount > 0 && !ready)) lessonsPanel = <PanelSkeleton />;
  else if (selection) lessonsPanel = <LessonsTab module={detail} selection={selection} progress={progressApi} onSelect={selectLesson} />;
  else {
    lessonsPanel = (
      <Panel padding="none">
        <EmptyState
          icon={PlayCircle}
          title={`No video lessons for ${m.unitCode || m.name} yet`}
          body="The study guide and past papers are in Overview. Have notes or a past paper for this module? Share them in the library."
          action={
            <>
              <Button onClick={() => setTab('overview')}>See resources</Button>
              {upload.start ? (
                <Button variant="primary" leadingIcon={UploadSimple} onClick={upload.start}>
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
      <ModuleHeader summary={m} detail={detail} progress={progress} progressReady={ready} tracking={tracking} resume={resume} exam={exam} onOpenLesson={openLesson} />

      <Tabs idBase="module" label="Module sections" className="mod-tabs" data-hub="module-tabs" tabs={tabs} value={tab} onChange={setTab} />

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
          {detail && featureOn('video_suggestions') ? (
            <ErrorBoundary name="SuggestVideo" resetKey={m.id}>
              <SuggestVideo module={detail} />
            </ErrorBoundary>
          ) : null}
        </TabPanel>
        {moduleTabOn('files', featureOn) ? (
          <TabPanel idBase="module" id="files" value={tab}>
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
            icon={MagnifyingGlass}
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
  if (m.id !== moduleId) return <Navigate replace to={`/modules/${m.id}${pathname.slice(`/modules/${moduleId}`.length)}${search}`} />;
  return <ModuleView key={m.id} summary={m} lessonId={lessonId} />;
}
