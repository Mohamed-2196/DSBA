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
  {
    id: 'module',
    path: '/modules/:moduleId',
    title: 'Module',
    Page: lazy(() => import('./features/modules/ModulePage')),
  },
  {
    id: 'lesson',
    path: '/modules/:moduleId/lessons/:lessonId',
    title: 'Lesson',
    Page: lazy(() => import('./features/modules/ModulePage')),
  },
  {
    id: 'practise',
    path: '/modules/:moduleId/practise/:chapterId',
    title: 'Practise',
    Page: lazy(() => import('./features/library/PractisePage')),
    feature: 'library.practice',
  },
  {
    id: 'noora',
    path: '/noora',
    title: 'Noora',
    Page: lazy(() => import('./features/noora/page/NooraPage')),
    feature: 'noora',
  },
  {
    id: 'library',
    path: '/library',
    title: 'Library',
    Page: lazy(() => import('./features/library/LibraryPage')),
    feature: 'library',
  },
  {
    id: 'file',
    path: '/library/:fileId',
    title: 'Library',
    Page: lazy(() => import('./features/library/FileViewerPage')),
    feature: 'library',
  },
  {
    id: 'newsletter',
    path: '/newsletter',
    title: 'The DSBA Newsletter',
    Page: lazy(() => import('./features/newsletter/NewsletterPage')),
    feature: 'newsletter',
  },
  {
    id: 'issue',
    path: '/newsletter/:slug',
    title: 'The DSBA Newsletter',
    Page: lazy(() => import('./features/newsletter/IssuePage')),
    feature: 'newsletter',
  },
  {
    id: 'forum',
    path: '/forum',
    title: 'Forum',
    Page: lazy(() => import('./features/forum/ForumPage')),
    feature: 'forum',
  },
  {
    id: 'forum-new',
    path: '/forum/new',
    title: 'Start a thread',
    Page: lazy(() => import('./features/forum/NewThreadPage')),
    feature: 'forum',
  },
  {
    id: 'thread',
    path: '/forum/:threadId',
    title: 'Forum',
    Page: lazy(() => import('./features/forum/ThreadPage')),
    feature: 'forum',
  },
  {
    id: 'electives',
    path: '/career/electives',
    title: 'Choosing your electives',
    Page: lazy(() => import('./features/career/ElectivesPage')),
    feature: 'career',
  },
  {
    id: 'career',
    path: '/career',
    title: 'Career Navigator',
    Page: lazy(() => import('./features/career/CareerPage')),
    feature: 'career',
  },
  {
    id: 'calendar',
    path: '/calendar',
    title: 'Calendar',
    Page: lazy(() => import('./features/calendar/CalendarPage')),
    feature: 'calendar',
  },
  {
    id: 'requests',
    path: '/requests',
    title: 'Requests',
    Page: lazy(() => import('./features/requests/RequestsPage')),
    feature: 'requests',
  },
  {
    id: 'request',
    path: '/requests/:requestId',
    title: 'Request',
    Page: lazy(() => import('./features/requests/RequestPage')),
    feature: 'requests',
  },
  {
    id: 'grades',
    path: '/grades',
    title: 'Grades',
    Page: lazy(() => import('./features/grades/GradesPage')),
    feature: 'grades',
  },
  {
    id: 'notes',
    path: '/notes',
    title: 'Notebook',
    Page: lazy(() => import('./features/notes/NotesPage')),
    feature: 'notes',
  },
  {
    id: 'shared-note',
    path: '/notes/shared/:shareId',
    title: 'Shared note',
    Page: lazy(() => import('./features/notes/shared/SharedNotePage')),
    feature: 'notes.share',
  },
  {
    id: 'note',
    path: '/notes/:noteId',
    title: 'Notebook',
    Page: lazy(() => import('./features/notes/NotePage')),
    feature: 'notes',
  },
  {
    id: 'daily',
    path: '/daily',
    title: 'Daily puzzles',
    Page: lazy(() => import('./features/daily/DailyPage')),
    feature: 'daily',
  },
  {
    id: 'daily-game',
    path: '/daily/:game',
    title: 'Daily',
    Page: lazy(() => import('./features/daily/DailyGamePage')),
    feature: 'daily',
  },
  {
    id: 'daily-day-game',
    path: '/daily/:day/:game',
    title: 'Daily',
    Page: lazy(() => import('./features/daily/DailyGamePage')),
    feature: 'daily',
  },
  {
    id: 'issue-edit',
    path: '/newsletter/:slug/edit',
    title: 'Edit issue',
    Page: lazy(() => import('./features/newsletter/IssueEditorPage')),
    feature: 'newsletter',
  },
  {
    id: 'account',
    path: '/account',
    title: 'Your account',
    Page: lazy(() => import('./features/account/AccountPage')),
    modules: false,
  },
  {
    id: 'manage',
    path: '/manage',
    title: 'Manage',
    Page: lazy(() => import('./features/manage/ManagePage')),
    modules: false,
  },
  {
    id: 'access',
    path: '/admin/access',
    title: 'Access',
    Page: lazy(() => import('./features/access/AccessPage')),
    modules: false,
  },
  {
    id: 'board',
    path: '/board',
    title: 'Boards',
    Page: lazy(() => import('./features/board/BoardPage')),
    feature: 'board',
    modules: false,
  },
  {
    id: 'results-day',
    path: '/results-day',
    title: 'Results day',
    Page: lazy(() => import('./features/start/ResultsDayPage')),
  },
  {
    id: 'start-here',
    path: '/start-here',
    title: 'Start here',
    Page: lazy(() => import('./features/start/StartHerePage')),
  },
  { id: 'about', path: '/about', title: 'About', Page: lazy(() => import('./features/site/AboutPage')) },
  {
    id: 'styleguide',
    path: '/styleguide',
    title: 'Style guide',
    Page: lazy(() => import('./features/about/StyleGuidePage')),
    // Open in development; in production for people who hold a manager box only.
    gate: import.meta.env.DEV
      ? undefined
      : (page) => (
          <Gate title="Style guide" anyBox={MANAGER_BOXES}>
            {page}
          </Gate>
        ),
  },
  {
    id: 'not-found',
    path: '*',
    title: 'Page not found',
    Page: lazy(() => import('./features/about/NotFoundPage')),
    modules: false,
  },
];

/** The pages as routes of the data router (ids are the pages' ids). */
export const pageRoutes: RouteObject[] = pages.map((route) => ({
  id: route.id,
  path: route.path,
  element: <RouteFrame route={route} />,
}));
