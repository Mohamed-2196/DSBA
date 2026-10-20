// Every page of the app: its URL, its default tab title and its lazy chunk. App.tsx puts them in the router under
// the shell (one layout route). Each page is lazy-loaded and wrapped in its own error boundary and Suspense
// (shell/RouteFrame.tsx), so one broken feature can't take down the rest of the app.
import type { QueryClient } from '@tanstack/react-query';
import { matchRoutes, type RouteObject } from 'react-router-dom';
import { queryClient } from './api/queryClient';
import { Gate, MANAGER_BOXES } from './auth';
import { prefetchHome } from './features/home/public';
import { lazyPage } from './shell/lazyPage';
import { RouteFrame, type AppRoute } from './shell/RouteFrame';

const pages: AppRoute[] = [
  { id: 'home', path: '/', title: null, Page: lazyPage(() => import('./features/home/HomePage')) },
  { id: 'modules', path: '/modules', title: 'Modules', Page: lazyPage(() => import('./features/modules/ModulesPage')) },
  {
    id: 'module',
    path: '/modules/:moduleId',
    title: 'Module',
    Page: lazyPage(() => import('./features/modules/ModulePage')),
  },
  {
    id: 'lesson',
    path: '/modules/:moduleId/lessons/:lessonId',
    title: 'Lesson',
    Page: lazyPage(() => import('./features/modules/ModulePage')),
  },
  {
    id: 'practise',
    path: '/modules/:moduleId/practise/:chapterId',
    title: 'Practise',
    Page: lazyPage(() => import('./features/library/PractisePage')),
    feature: 'library.practice',
  },
  {
    id: 'noora',
    path: '/noora',
    title: 'Noora',
    Page: lazyPage(() => import('./features/noora/page/NooraPage')),
    feature: 'noora',
  },
  {
    id: 'library',
    path: '/library',
    title: 'Library',
    Page: lazyPage(() => import('./features/library/LibraryPage')),
    feature: 'library',
  },
  {
    id: 'file',
    path: '/library/:fileId',
    title: 'Library',
    Page: lazyPage(() => import('./features/library/FileViewerPage')),
    feature: 'library',
  },
  {
    id: 'newsletter',
    path: '/newsletter',
    title: 'The DSBA Newsletter',
    Page: lazyPage(() => import('./features/newsletter/NewsletterPage')),
    feature: 'newsletter',
  },
  {
    id: 'issue',
    path: '/newsletter/:slug',
    title: 'The DSBA Newsletter',
    Page: lazyPage(() => import('./features/newsletter/IssuePage')),
    feature: 'newsletter',
  },
  {
    id: 'forum',
    path: '/forum',
    title: 'Forum',
    Page: lazyPage(() => import('./features/forum/ForumPage')),
    feature: 'forum',
  },
  {
    id: 'forum-new',
    path: '/forum/new',
    title: 'Start a thread',
    Page: lazyPage(() => import('./features/forum/NewThreadPage')),
    feature: 'forum',
  },
  {
    id: 'thread',
    path: '/forum/:threadId',
    title: 'Forum',
    Page: lazyPage(() => import('./features/forum/ThreadPage')),
    feature: 'forum',
  },
  {
    id: 'electives',
    path: '/career/electives',
    title: 'Choosing your electives',
    Page: lazyPage(() => import('./features/career/ElectivesPage')),
    feature: 'career',
  },
  {
    id: 'career',
    path: '/career',
    title: 'Career Navigator',
    Page: lazyPage(() => import('./features/career/CareerPage')),
    feature: 'career',
  },
  {
    id: 'calendar',
    path: '/calendar',
    title: 'Calendar',
    Page: lazyPage(() => import('./features/calendar/CalendarPage')),
    feature: 'calendar',
  },
  {
    id: 'requests',
    path: '/requests',
    title: 'Requests',
    Page: lazyPage(() => import('./features/requests/RequestsPage')),
    feature: 'requests',
  },
  {
    id: 'request',
    path: '/requests/:requestId',
    title: 'Request',
    Page: lazyPage(() => import('./features/requests/RequestPage')),
    feature: 'requests',
  },
  {
    id: 'grades',
    path: '/grades',
    title: 'Grades',
    Page: lazyPage(() => import('./features/grades/GradesPage')),
    feature: 'grades',
  },
  {
    id: 'notes',
    path: '/notes',
    title: 'Notebook',
    Page: lazyPage(() => import('./features/notes/NotesPage')),
    feature: 'notes',
  },
  {
    id: 'shared-note',
    path: '/notes/shared/:shareId',
    title: 'Shared note',
    Page: lazyPage(() => import('./features/notes/shared/SharedNotePage')),
    feature: 'notes.share',
  },
  {
    id: 'note',
    path: '/notes/:noteId',
    title: 'Notebook',
    Page: lazyPage(() => import('./features/notes/NotePage')),
    feature: 'notes',
  },
  {
    id: 'daily',
    path: '/daily',
    title: 'Daily puzzles',
    Page: lazyPage(() => import('./features/daily/DailyPage')),
    feature: 'daily',
  },
  {
    id: 'daily-game',
    path: '/daily/:game',
    title: 'Daily',
    Page: lazyPage(() => import('./features/daily/DailyGamePage')),
    feature: 'daily',
  },
  {
    id: 'daily-day-game',
    path: '/daily/:day/:game',
    title: 'Daily',
    Page: lazyPage(() => import('./features/daily/DailyGamePage')),
    feature: 'daily',
  },
  {
    id: 'issue-edit',
    path: '/newsletter/:slug/edit',
    title: 'Edit issue',
    Page: lazyPage(() => import('./features/newsletter/IssueEditorPage')),
    feature: 'newsletter',
  },
  {
    id: 'account',
    path: '/account',
    title: 'Your account',
    Page: lazyPage(() => import('./features/account/AccountPage')),
    modules: false,
  },
  {
    id: 'manage',
    path: '/manage',
    title: 'Manage',
    Page: lazyPage(() => import('./features/manage/ManagePage')),
    modules: false,
  },
  {
    id: 'access',
    path: '/admin/access',
    title: 'Access',
    Page: lazyPage(() => import('./features/access/AccessPage')),
    modules: false,
  },
  {
    id: 'board',
    path: '/board',
    title: 'Boards',
    Page: lazyPage(() => import('./features/board/BoardPage')),
    feature: 'board',
    modules: false,
  },
  {
    id: 'results-day',
    path: '/results-day',
    title: 'Results day',
    Page: lazyPage(() => import('./features/guides/ResultsDayPage')),
  },
  { id: 'about', path: '/about', title: 'About', Page: lazyPage(() => import('./features/site/AboutPage')) },
  {
    id: 'styleguide',
    path: '/styleguide',
    title: 'Style guide',
    Page: lazyPage(() => import('./features/about/StyleGuidePage')),
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
    Page: lazyPage(() => import('./features/about/NotFoundPage')),
    modules: false,
  },
];

/** The pages as routes of the data router (ids are the pages' ids). */
export const pageRoutes: RouteObject[] = pages.map((route) => ({
  id: route.id,
  path: route.path,
  element: <RouteFrame route={route} />,
}));

/** What a page's first screen reads, asked for with its code: Home's one request. */
const pageData: Partial<Record<string, (qc: QueryClient) => void>> = { home: prefetchHome };

/**
 * Starts fetching the code of the page at this address, and the data its first screen reads, so they download
 * alongside the session and the module catalogue rather than after them (main.tsx calls it before the first render).
 * A chunk that fails is fetched again when the page renders, and its error shows there; so is a request.
 */
export function preloadPage(location: { pathname: string }): void {
  const id = matchRoutes(pageRoutes, location, import.meta.env.BASE_URL)?.at(-1)?.route.id;
  pages
    .find((p) => p.id === id)
    ?.Page.preload()
    .catch(() => undefined);
  if (id) pageData[id]?.(queryClient);
}

/** Props for a link to one of the pages: its code (and its data) start downloading when the link is pointed at or
 *  focused. */
export function preloadOnIntent(to: string): { onPointerEnter: () => void; onFocus: () => void } {
  const preload = () => preloadPage({ pathname: to });
  return { onPointerEnter: preload, onFocus: preload };
}
