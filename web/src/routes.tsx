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
