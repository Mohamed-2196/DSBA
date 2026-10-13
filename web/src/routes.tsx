// Every page of the app: its URL, its default tab title and its lazy chunk. App.tsx puts them in the router under
// the shell (one layout route). Each page is lazy-loaded and wrapped in its own error boundary and Suspense
// (shell/RouteFrame.tsx), so one broken feature can't take down the rest of the app.
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Gate, MANAGER_BOXES } from './auth';
import { RouteFrame, type AppRoute } from './shell/RouteFrame';

const pages: AppRoute[] = [
  { id: 'home', path: '/', title: null, Page: lazy(() => import('./features/home/HomePage')) },
  { id: 'modules', path: '/modules', title: 'Modules', Page: lazy(() => import('./features/modules/ModulesPage')) },
  { id: 'module', path: '/modules/:moduleId', title: 'Module', Page: lazy(() => import('./features/modules/ModulePage')) },
  { id: 'library', path: '/library', title: 'Library', Page: lazy(() => import('./features/library/LibraryPage')), feature: 'library' },
  { id: 'file', path: '/library/:fileId', title: 'Library', Page: lazy(() => import('./features/library/FileViewerPage')), feature: 'library' },
  { id: 'newsletter', path: '/newsletter', title: 'The DSBA Newsletter', Page: lazy(() => import('./features/newsletter/NewsletterPage')), feature: 'newsletter' },
  { id: 'issue', path: '/newsletter/:slug', title: 'The DSBA Newsletter', Page: lazy(() => import('./features/newsletter/IssuePage')), feature: 'newsletter' },
  { id: 'forum', path: '/forum', title: 'Forum', Page: lazy(() => import('./features/forum/ForumPage')), feature: 'forum' },
  { id: 'forum-new', path: '/forum/new', title: 'Start a thread', Page: lazy(() => import('./features/forum/NewThreadPage')), feature: 'forum' },
  { id: 'thread', path: '/forum/:threadId', title: 'Forum', Page: lazy(() => import('./features/forum/ThreadPage')), feature: 'forum' },
  { id: 'career', path: '/career', title: 'Career Navigator', Page: lazy(() => import('./features/career/CareerPage')), feature: 'career' },
  { id: 'calendar', path: '/calendar', title: 'Calendar', Page: lazy(() => import('./features/calendar/CalendarPage')), feature: 'calendar' },
  { id: 'grades', path: '/grades', title: 'Grades', Page: lazy(() => import('./features/grades/GradesPage')), feature: 'grades' },
  { id: 'issue-edit', path: '/newsletter/:slug/edit', title: 'Edit issue', Page: lazy(() => import('./features/newsletter/IssueEditorPage')), feature: 'newsletter' },
  { id: 'account', path: '/account', title: 'Your account', Page: lazy(() => import('./features/account/AccountPage')), modules: false },
  { id: 'manage', path: '/manage', title: 'Manage', Page: lazy(() => import('./features/manage/ManagePage')), modules: false },
  { id: 'access', path: '/admin/access', title: 'Access', Page: lazy(() => import('./features/access/AccessPage')), modules: false },
  { id: 'board', path: '/board', title: 'Study board', Page: lazy(() => import('./features/board/BoardPage')), feature: 'board', modules: false },
  { id: 'about', path: '/about', title: 'About', Page: lazy(() => import('./features/about/AboutPage')) },
  {
    id: 'styleguide',
    path: '/styleguide',
    title: 'Style guide',
    Page: lazy(() => import('./features/about/StyleGuidePage')),
    // Open in development; in production for people who hold a manager box only (code quality review CQ-17).
    gate: import.meta.env.DEV
      ? undefined
      : (page) => (
          <Gate title="Style guide" anyBox={MANAGER_BOXES}>
            {page}
          </Gate>
        ),
  },
  { id: 'not-found', path: '*', title: 'Page not found', Page: lazy(() => import('./features/about/NotFoundPage')), modules: false },
];

/** The pages as routes of the data router (ids are the pages' ids). */
export const pageRoutes: RouteObject[] = pages.map((route) => ({ id: route.id, path: route.path, element: <RouteFrame route={route} /> }));
