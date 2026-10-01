import { lazy, Suspense, useLayoutEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { PageLoader } from './shell/PageLoader.jsx';
import { RouteErrorBoundary } from './shell/RouteErrorBoundary.jsx';

// Every page is lazy-loaded and wrapped in its own error boundary + Suspense,
// so one broken feature can't take down the rest of the app.
const ROUTES = [
  { id: 'home', path: '/', title: null, Page: lazy(() => import('./features/home/HomePage.jsx')) },
  { id: 'modules', path: '/modules', title: 'Modules', Page: lazy(() => import('./features/modules/ModulesPage.jsx')) },
  { id: 'module', path: '/modules/:moduleId', title: 'Module', Page: lazy(() => import('./features/modules/ModulePage.jsx')) },
  { id: 'library', path: '/library', title: 'Library', Page: lazy(() => import('./features/library/LibraryPage.jsx')) },
  { id: 'file', path: '/library/:fileId', title: 'Library', Page: lazy(() => import('./features/library/FileViewerPage.jsx')) },
  { id: 'newsletter', path: '/newsletter', title: 'The Pulse', Page: lazy(() => import('./features/newsletter/NewsletterPage.jsx')) },
  { id: 'issue', path: '/newsletter/:slug', title: 'The Pulse', Page: lazy(() => import('./features/newsletter/IssuePage.jsx')) },
  { id: 'forum', path: '/forum', title: 'Forum', Page: lazy(() => import('./features/forum/ForumPage.jsx')) },
  { id: 'forum-new', path: '/forum/new', title: 'Start a thread', Page: lazy(() => import('./features/forum/NewThreadPage.jsx')) },
  { id: 'thread', path: '/forum/:threadId', title: 'Forum', Page: lazy(() => import('./features/forum/ThreadPage.jsx')) },
  { id: 'calendar', path: '/calendar', title: 'Calendar', Page: lazy(() => import('./features/calendar/CalendarPage.jsx')) },
  { id: 'grades', path: '/grades', title: 'Grades', Page: lazy(() => import('./features/grades/GradesPage.jsx')) },
  { id: 'about', path: '/about', title: 'About', Page: lazy(() => import('./features/about/AboutPage.jsx')) },
  { id: 'styleguide', path: '/styleguide', title: 'Style guide', Page: lazy(() => import('./features/about/StyleGuidePage.jsx')) },
  { id: 'not-found', path: '*', title: 'Page not found', Page: lazy(() => import('./features/about/NotFoundPage.jsx')) },
];

function RouteFrame({ route }) {
  const { pathname } = useLocation();
  const { id, title, Page } = route;
  // Default tab title. A layout effect, so a page's own useDocumentTitle() (a passive effect) wins.
  useLayoutEffect(() => {
    document.title = title ? `${title} – DSBA Pulse` : 'DSBA Pulse';
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
