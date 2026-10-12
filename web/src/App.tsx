import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './api/queryClient';
import { AuthProvider } from './auth';
import { AppShell } from './shell/AppShell';
import { AppRoutes } from './routes';
import { ModulesProvider } from './state/ModulesProvider';
import { ThemeProvider, ToastProvider, YearProvider } from './state';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <YearProvider>
          <ToastProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <AuthProvider>
                {/* The catalogue loads alongside: the shell shows at once, and each page waits for it (routes.tsx). */}
                <ModulesProvider>
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
