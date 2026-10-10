// /modules/:moduleId: header (code, name, year, next exam, progress and quick actions) and URL-driven tabs:
// ?tab=overview|lessons|files|discussion, the lesson via &chapter=<i>&video=<j> (0-based).
// The header comes from the catalogue at once; chapters, videos and resources load with GET /modules/{id}.
import { ArrowSquareOut, BookOpenText, CalendarBlank, CaretLeft, ChatsCircle, Files, Info, MagnifyingGlass, Play, PlayCircle, WarningCircle } from '@phosphor-icons/react';
import { useCallback, useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import type { ModuleDetail, ModuleSummary } from '../../api/types';
import { CONTRIBUTE_URL } from '../../data/people';
import { COHORTS, cohortColor, useDocumentTitle, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { Badge, Button, CohortBadge, EmptyState, ErrorBoundary, ModuleIcon, Page, Panel, ProgressRing, Skeleton, TabPanel, Tabs } from '../../ui';
import { ModuleThreads } from '../forum/public';
import { ModuleFiles } from '../library/public';
import { useModule } from './api';
import { useModuleExam, type ExamInfo } from './exams';
import { ImportProgressPrompt } from './ImportProgressPrompt';
import { LessonsTab } from './LessonsTab';
import { chapterPosition, indexParam, isModuleTab, type ModuleTab } from './lessons';
import { ModuleOverview } from './ModuleOverview';
import { computeModuleProgress, computeResumePoint, isValidLesson, summaryProgress, useProgress, type Fraction, type ResumeKind, type ResumePoint } from './progress';
import { resourceSummary } from './resources';
import './ModulePage.css';

const RESUME_LABEL: Record<ResumeKind, string> = { resume: 'Resume lesson', next: 'Continue', start: 'Start lesson 1', done: 'Watch again' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function https(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function ModuleHeader({
  summary: m,
  detail,
  progress,
  progressReady,
  resume,
  exam,
  onOpenLesson,
}: {
  summary: ModuleSummary;
  detail: ModuleDetail | undefined;
  progress: Fraction;
  progressReady: boolean;
  resume: ResumePoint | null;
  exam: ExamInfo | null;
  onOpenLesson: (c: number, v: number) => void;
}) {
  const { year } = useYear();
  const r = detail?.resources;
  const pastPapers = https(r?.vle) ?? https(r?.olderExams);
  const studyGuide = https(r?.materials);
  const backTo = year === m.year ? '/modules' : `/modules?year=${m.year}`;
  const resumeChapter = resume && detail ? detail.chapters[resume.c] : null;

  let resumeNote: string | null = null;
  if (resume?.kind === 'done') resumeNote = 'You have watched every video.';
  else if (resume?.kind === 'start') resumeNote = 'Start with chapter 1.';
  else if (resume && resumeChapter) {
    resumeNote = `Up next: ${chapterPosition(resume.c, resumeChapter.videos[resume.v], resume.v, resumeChapter.videos.length).toLowerCase()}.`;
  }

  const counts = [
    m.lessonCount ? `${plural(m.chapterCount, 'chapter')}, ${plural(m.lessonCount, 'video lesson')}` : detail ? resourceSummary(detail) : null,
    m.libraryCount ? `${plural(m.libraryCount, 'file')} in the library` : null,
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
            {counts.length ? <span className="mod-head__counts">{counts.join(', ')}</span> : null}
          </div>
        </div>

        <Panel as="div" padding="none" className="mod-head__side">
          {m.lessonCount ? (
            <>
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
              <div className="mod-head__actions">
                {resume ? (
                  <Button variant="primary" leadingIcon={Play} onClick={() => onOpenLesson(resume.c, resume.v)}>
                    {RESUME_LABEL[resume.kind]}
                  </Button>
                ) : (
                  <Skeleton width={150} height={40} radius={10} />
                )}
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
                {studyGuide ? (
                  <Button variant="primary" href={studyGuide} trailingIcon={ArrowSquareOut} aria-label="Study guide (opens in a new tab)">
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

function PanelSkeleton() {
  return (
    <div className="mod-loading" aria-hidden="true">
      <Skeleton height={320} radius={16} />
      <Skeleton lines={3} />
    </div>
  );
}

function ModuleView({ summary: m }: { summary: ModuleSummary }) {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: ModuleTab = isModuleTab(rawTab) ? rawTab : 'overview';
  const detailQ = useModule(m.id);
  const detail = detailQ.data;
  const progressApi = useProgress();
  const { state, ready } = progressApi;
  const exam = useModuleExam(m.id);
  const progress = detail ? computeModuleProgress(state, detail) : summaryProgress(state, m.id, m.lessonCount);
  const resume = detail && ready ? computeResumePoint(state, detail) : null;

  const update = useCallback(
    (patch: Record<string, string | number | null>) => {
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
    (id: string) => update(id === 'lessons' ? { tab: 'lessons' } : { tab: id === 'overview' ? null : id, chapter: null, video: null }),
    [update],
  );
  const openLesson = useCallback(
    (c: number, v: number) => {
      update({ tab: 'lessons', chapter: c, video: v });
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [update],
  );
  const selectLesson = useCallback((c: number, v: number) => update({ tab: 'lessons', chapter: c, video: v }), [update]);

  // The lesson on screen: from the URL, else where the student left off, else the first one.
  const cParam = indexParam(params.get('chapter'));
  const vParam = indexParam(params.get('video'));
  const fromUrl = !!detail && cParam != null && isValidLesson(detail, cParam, vParam ?? 0);
  const selection = fromUrl && cParam != null ? { c: cParam, v: vParam ?? 0 } : resume ? { c: resume.c, v: resume.v } : null;

  // Pin the resolved lesson in the URL, so marking it watched doesn't move the player along.
  const pinC = selection?.c;
  const pinV = selection?.v;
  useEffect(() => {
    if (tab === 'lessons' && !fromUrl && pinC != null) update({ chapter: pinC, video: pinV ?? 0 });
  }, [tab, fromUrl, pinC, pinV, update]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'lessons', label: 'Lessons', icon: PlayCircle, count: m.lessonCount || null },
    { id: 'files', label: 'Files', icon: Files, count: m.libraryCount || null },
    { id: 'discussion', label: 'Discussion', icon: ChatsCircle },
  ];

  let detailProblem: ReactNode = null;
  if (detailQ.isError) {
    detailProblem = (
      <Panel padding="none">
        <EmptyState
          icon={WarningCircle}
          title="This module’s lessons didn’t load"
          body="Check your connection, then try again."
          action={<Button onClick={() => void detailQ.refetch()}>Try again</Button>}
        />
      </Panel>
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
    );
  }

  return (
    <Page className={`mod-page mod-page--y${m.year}`}>
      <ModuleHeader summary={m} detail={detail} progress={progress} progressReady={ready} resume={resume} exam={exam} onOpenLesson={openLesson} />

      <Tabs idBase="module" label="Module sections" className="mod-tabs" data-hub="module-tabs" tabs={tabs} value={tab} onChange={setTab} />

      <div className="mod-panels">
        <TabPanel idBase="module" id="overview" value={tab}>
          {detailProblem ??
            (detail ? (
              <ModuleOverview module={detail} state={state} resume={resume} libraryCount={m.libraryCount} onOpenLesson={openLesson} onTab={setTab} />
            ) : (
              <PanelSkeleton />
            ))}
        </TabPanel>
        <TabPanel idBase="module" id="lessons" value={tab}>
          {lessonsPanel}
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
      <ImportProgressPrompt />
    </Page>
  );
}

export default function ModulePage() {
  const { moduleId = '' } = useParams();
  const { search } = useLocation();
  const { getModule, getModuleByUnitCode } = useModules();
  // Links from v1 ('/modules/advanced_stats_distribution', '/modules/Business') and unit codes ('/modules/ST2133') still work.
  const m = getModule(moduleId) ?? getModule(moduleId.toLowerCase().replace(/_/g, '-')) ?? getModuleByUnitCode(moduleId.toUpperCase());
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
  if (m.id !== moduleId) return <Navigate replace to={`/modules/${m.id}${search}`} />;
  return <ModuleView key={m.id} summary={m} />;
}
