import { HashRouter } from 'react-router-dom';
import { ThemeProvider, ToastProvider, YearProvider } from './state';
import { AppShell } from './shell/AppShell.jsx';
import { AppRoutes } from './routes.jsx';

export default function App() {
  return (
    <ThemeProvider>
      <YearProvider>
        <ToastProvider>
          <HashRouter>
            <AppShell>
              <AppRoutes />
            </AppShell>
          </HashRouter>
        </ToastProvider>
      </YearProvider>
    </ThemeProvider>
  );
}
