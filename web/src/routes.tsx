import { lazy, Suspense, useLayoutEffect, type ComponentType, type LazyExoticComponent } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { PageLoader } from './shell/PageLoader';
import { RouteErrorBoundary } from './shell/RouteErrorBoundary';

interface AppRoute {
  id: string;
  path: string;
  title: string | null;
  Page: LazyExoticComponent<ComponentType>;
}

// Every page is lazy-loaded and wrapped in its own error boundary + Suspense,
// so one broken feature can't take down the rest of the app.
export const ROUTES: AppRoute[] = [
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
  { id: 'account', path: '/account', title: 'Your account', Page: lazy(() => import('./features/account/AccountPage')) },
  { id: 'moderation', path: '/moderation', title: 'Moderation', Page: lazy(() => import('./features/moderation/ModerationPage')) },
  { id: 'people', path: '/admin/people', title: 'People', Page: lazy(() => import('./features/admin/PeoplePage')) },
  { id: 'about', path: '/about', title: 'About', Page: lazy(() => import('./features/about/AboutPage')) },
  { id: 'styleguide', path: '/styleguide', title: 'Style guide', Page: lazy(() => import('./features/about/StyleGuidePage')) },
  { id: 'not-found', path: '*', title: 'Page not found', Page: lazy(() => import('./features/about/NotFoundPage')) },
];

function RouteFrame({ route }: { route: AppRoute }) {
  const { pathname } = useLocation();
  const { id, title, Page } = route;
  // Default tab title. A layout effect, so a page's own useDocumentTitle() (a passive effect) wins.
  useLayoutEffect(() => {
    document.title = title ? `${title} – DSBA Hub` : 'DSBA Hub';
  }, [title, pathname]);
  return (
    <RouteErrorBoundary key={pathname} routeId={id}>
      <Suspense fallback={<PageLoader />}>
        <Page />
      </Suspense>
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
