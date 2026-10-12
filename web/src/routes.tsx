import { lazy, Suspense, useLayoutEffect, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { RoleGate } from './auth';
import { PageLoader } from './shell/PageLoader';
import { RouteErrorBoundary } from './shell/RouteErrorBoundary';
import { ModulesGate } from './state/ModulesProvider';
import { Page as PageFrame, QueryError } from './ui';

interface AppRoute {
  id: string;
  path: string;
  title: string | null;
  Page: LazyExoticComponent<ComponentType>;
  /** false: the page doesn't use the module catalogue, so it shows even when the catalogue can't be loaded */
  modules?: false;
  /** who may open it (the style guide is a tool for the team, not a page for students) */
  gate?: (page: ReactNode) => ReactNode;
}

// Every page is lazy-loaded and wrapped in its own error boundary + Suspense,
// so one broken feature can't take down the rest of the app.
const ROUTES: AppRoute[] = [
  { id: 'home', path: '/', title: null, Page: lazy(() => import('./features/home/HomePage')) },
  { id: 'modules', path: '/modules', title: 'Modules', Page: lazy(() => import('./features/modules/ModulesPage')) },
  { id: 'module', path: '/modules/:moduleId', title: 'Module', Page: lazy(() => import('./features/modules/ModulePage')) },
  { id: 'library', path: '/library', title: 'Library', Page: lazy(() => import('./features/library/LibraryPage')) },
  { id: 'file', path: '/library/:fileId', title: 'Library', Page: lazy(() => import('./features/library/FileViewerPage')) },
  { id: 'newsletter', path: '/newsletter', title: 'The DSBA Newsletter', Page: lazy(() => import('./features/newsletter/NewsletterPage')) },
  { id: 'issue', path: '/newsletter/:slug', title: 'The DSBA Newsletter', Page: lazy(() => import('./features/newsletter/IssuePage')) },
  { id: 'forum', path: '/forum', title: 'Forum', Page: lazy(() => import('./features/forum/ForumPage')) },
  { id: 'forum-new', path: '/forum/new', title: 'Start a thread', Page: lazy(() => import('./features/forum/NewThreadPage')) },
  { id: 'thread', path: '/forum/:threadId', title: 'Forum', Page: lazy(() => import('./features/forum/ThreadPage')) },
  { id: 'career', path: '/career', title: 'Career Navigator', Page: lazy(() => import('./features/career/CareerPage')) },
  { id: 'calendar', path: '/calendar', title: 'Calendar', Page: lazy(() => import('./features/calendar/CalendarPage')) },
  { id: 'grades', path: '/grades', title: 'Grades', Page: lazy(() => import('./features/grades/GradesPage')) },
  { id: 'issue-edit', path: '/newsletter/:slug/edit', title: 'Edit issue', Page: lazy(() => import('./features/newsletter/IssueEditorPage')) },
  { id: 'account', path: '/account', title: 'Your account', Page: lazy(() => import('./features/account/AccountPage')), modules: false },
  { id: 'moderation', path: '/moderation', title: 'Moderation', Page: lazy(() => import('./features/moderation/ModerationPage')) },
  { id: 'people', path: '/admin/people', title: 'People', Page: lazy(() => import('./features/admin/PeoplePage')), modules: false },
  { id: 'about', path: '/about', title: 'About', Page: lazy(() => import('./features/about/AboutPage')) },
  {
    id: 'styleguide',
    path: '/styleguide',
    title: 'Style guide',
    Page: lazy(() => import('./features/about/StyleGuidePage')),
    // Open in development; in production for student reps and admins only (code quality review CQ-17).
    gate: import.meta.env.DEV
      ? undefined
      : (page) => (
          <RoleGate need="moderator" title="Style guide">
            {page}
          </RoleGate>
        ),
  },
  { id: 'not-found', path: '*', title: 'Page not found', Page: lazy(() => import('./features/about/NotFoundPage')), modules: false },
];

/** A page that can't show because the module catalogue didn't load: the rest of the Hub still works. */
function CatalogueFailed({ retry, error, retrying }: { retry: () => void; error: unknown; retrying: boolean }) {
  return (
    <PageFrame>
      <QueryError error={error} title="This page didn’t load" onRetry={retry} retrying={retrying} />
    </PageFrame>
  );
}

function RouteFrame({ route }: { route: AppRoute }) {
  const { pathname } = useLocation();
  const { id, title, Page, modules, gate } = route;
  // Default tab title. A layout effect, so a page's own useDocumentTitle() (a passive effect) wins.
  useLayoutEffect(() => {
    document.title = title ? `${title} – DSBA Hub` : 'DSBA Hub';
  }, [title, pathname]);
  const page =
    modules === false ? (
      <Page />
    ) : (
      <ModulesGate fallback={<PageLoader />} error={(retry, error, retrying) => <CatalogueFailed retry={retry} error={error} retrying={retrying} />}>
        <Page />
      </ModulesGate>
    );
  return (
    <RouteErrorBoundary key={pathname} routeId={id}>
      <Suspense fallback={<PageLoader />}>{gate ? gate(page) : page}</Suspense>
    </RouteErrorBoundary>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {ROUTES.map((r) => (
        <Route key={r.id} path={r.path} element={<RouteFrame route={r} />} />
      ))}
    </Routes>
  );
}
