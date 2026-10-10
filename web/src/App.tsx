import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './api/queryClient';
import { AuthProvider } from './auth';
import { AppShell } from './shell/AppShell';
import { AppRoutes } from './routes';
import { PageLoader } from './shell/PageLoader';
import { ModulesProvider } from './state/modules';
import { LoadFailed } from './shell/LoadFailed';
import { ThemeProvider, ToastProvider, YearProvider } from './state';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <YearProvider>
          <ToastProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <AuthProvider>
                <ModulesProvider fallback={<PageLoader />} error={(retry) => <LoadFailed onRetry={retry} />}>
                  <AppShell>
                    <AppRoutes />
                  </AppShell>
                </ModulesProvider>
              </AuthProvider>
            </BrowserRouter>
          </ToastProvider>
        </YearProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
