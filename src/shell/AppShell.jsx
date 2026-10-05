import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ErrorBoundary, Toaster } from '../ui';
import { CommandPalette } from '../features/search/public.js';
import { Onboarding } from '../features/onboarding/public.js';
import { MiniNoora } from '../features/noora/public.js';
import { Sidebar } from './Sidebar.jsx';
import { TopBar } from './TopBar.jsx';
import { MobileNav } from './MobileNav.jsx';
import { SiteFooter } from './SiteFooter.jsx';
import './AppShell.css';

/** App frame: rail + sticky top bar + content (+ footer), mobile tab bar, and global overlays. */
export function AppShell({ children }) {
  const { pathname } = useLocation();
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
      <ErrorBoundary name="Onboarding" fallback={null}>
        <Onboarding />
      </ErrorBoundary>
      <ErrorBoundary name="MiniNoora" fallback={null}>
        <MiniNoora />
      </ErrorBoundary>
      <Toaster />
    </div>
  );
}
