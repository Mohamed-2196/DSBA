import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorBoundary, Toaster } from '../ui';
import { CommandPalette } from '../features/search/public';
import { Onboarding } from '../features/onboarding/public';
import { MiniNoora } from '../features/noora/public';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';
import { SiteFooter } from './SiteFooter';
import './AppShell.css';

/** App frame: rail + sticky top bar + content (+ footer), mobile tab bar, and global overlays. */
export function AppShell({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const { status } = useAuth();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="shell">
      <button type="button" className="shell-skip" onClick={() => document.getElementById('main')?.focus()}>
        Skip to content
      </button>
      <Sidebar />
      <div className="shell-main">
        <TopBar />
        <main id="main" tabIndex={-1} className="shell-content">
          {children}
        </main>
        <SiteFooter />
      </div>
      <MobileNav />
      {/* Feature-owned overlays: isolated so a crash in one can't take down the app. */}
      <ErrorBoundary name="CommandPalette" fallback={null}>
        <CommandPalette />
      </ErrorBoundary>
      {/* Onboarding asks for a year when none is chosen: wait until we know whether a signed-in cohort sets it. */}
      {status !== 'loading' ? (
        <ErrorBoundary name="Onboarding" fallback={null}>
          <Onboarding />
        </ErrorBoundary>
      ) : null}
      <ErrorBoundary name="MiniNoora" fallback={null}>
        <MiniNoora />
      </ErrorBoundary>
      <Toaster />
    </div>
  );
}
