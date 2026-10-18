import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { queryClient } from './api/queryClient';
import { AuthProvider } from './auth';
import { pageRoutes } from './routes';
import { AppCrashed } from './shell/AppCrashed';
import { AppShell } from './shell/AppShell';
import { ModulesProvider } from './state/ModulesProvider';
import { ThemeProvider, ToastProvider, YearProvider } from './state';

/** The app inside the router: the account, the module catalogue and the shell, with the page in <Outlet />. */
function AppFrame() {
  return (
    <AuthProvider>
      {/* The catalogue loads alongside: the shell shows at once, and each page waits for it (shell/RouteFrame.tsx). */}
      <ModulesProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </ModulesProvider>
    </AuthProvider>
  );
}

// A data router, so a page can hold a navigation until it is answered: Manage and the newsletter's issue editor ask
// before unsaved changes are left behind by a link, the ⌘K palette or Back (state/useLeaveGuard.ts).
const router = createBrowserRouter(
  [{ id: 'app', element: <AppFrame />, errorElement: <AppCrashed />, children: pageRoutes }],
  {
    basename: import.meta.env.BASE_URL,
  },
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <YearProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </YearProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
