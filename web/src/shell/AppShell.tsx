import { lazy, Suspense, type ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { ModulesGate } from '../state/ModulesProvider';
import { ErrorBoundary, Toaster } from '../ui';
import { AnalyticsFeatures } from './AnalyticsFeatures';
import { PaletteHost } from '../features/search/public';
import { Onboarding } from '../features/onboarding/public';
import { MiniNoora } from '../features/noora/public';
import { BugReportDialog } from '../features/bugs/public';
import { useScrollMemory } from './scrollMemory';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { UpdatePrompt } from './UpdatePrompt';
import { OfflineBar } from './OfflineBar';
import { MobileNav } from './MobileNav';
import { SiteFooter } from './SiteFooter';
import './AppShell.css';

// Loaded after the page, not with the app: most pages load the library's code anyway, and the recorder is needed only
// on a note or a lesson.
const TimerPill = lazy(() => import('../features/library/public').then((m) => ({ default: m.TimerPill })));
const VisitRecorder = lazy(() => import('../features/carryon/public').then((m) => ({ default: m.VisitRecorder })));
const RECORDED = ['/notes/:noteId', '/modules/:moduleId/lessons/:lessonId'];

/** App frame: rail + sticky top bar + content (+ footer), mobile tab bar, and global overlays. */
export function AppShell({ children }: { children?: ReactNode }) {
  const { status, featureOn } = useAuth();
  const { pathname } = useLocation();
  useScrollMemory();
  const recorded = RECORDED.some((p) => matchPath(p, pathname));

  return (
    <div className="shell">
      <button type="button" className="shell-skip" onClick={() => document.getElementById('main')?.focus()}>
        Skip to content
      </button>
      <Sidebar />
      <div className="shell-main">
        <TopBar />
        <OfflineBar />
        <main id="main" tabIndex={-1} className="shell-content">
          {children}
        </main>
        {/* Time me's clock, on every page but the paper's own: it floats over the foot of the page. */}
        <ErrorBoundary name="TimerPill" fallback={null}>
          <Suspense fallback={null}>
            <TimerPill />
          </Suspense>
        </ErrorBoundary>
        <SiteFooter />
      </div>
      <MobileNav />
      {/* Feature-owned overlays: isolated so a crash in one can't take down the app, and mounted once the module
          catalogue they use is there. */}
      <ModulesGate>
        <ErrorBoundary name="CommandPalette" fallback={null}>
          <PaletteHost />
        </ErrorBoundary>
        {/* Onboarding asks for a year when none is chosen: wait until we know whether a signed-in cohort sets it. */}
        {status !== 'loading' ? (
          <ErrorBoundary name="Onboarding" fallback={null}>
            <Onboarding />
          </ErrorBoundary>
        ) : null}
      </ModulesGate>
      {/* Mini Noora floats over the page; she keeps clear of the bars and the page's primary buttons. */}
      {featureOn('noora') ? (
        <ErrorBoundary name="MiniNoora" fallback={null}>
          <MiniNoora />
        </ErrorBoundary>
      ) : null}
      {recorded ? (
        <ErrorBoundary name="VisitRecorder" fallback={null}>
          <Suspense fallback={null}>
            <VisitRecorder />
          </Suspense>
        </ErrorBoundary>
      ) : null}
      <ErrorBoundary name="BugReport" fallback={null}>
        <BugReportDialog />
      </ErrorBoundary>
      <Toaster />
      <UpdatePrompt />
      <AnalyticsFeatures />
    </div>
  );
}
