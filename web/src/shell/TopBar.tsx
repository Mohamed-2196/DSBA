import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MagnifyingGlass, UploadSimple } from '@phosphor-icons/react';
import { Button, ErrorBoundary, IconButton, HubLogo, SearchField, cx } from '../ui';
import { openCommandPalette } from '../features/search/public';
import { NotificationsMenu } from '../features/notifications/public';
import { YearSwitcher } from './YearSwitcher';
import { ProfileMenu } from './ProfileMenu';
import { useStartUpload } from './upload';
import './TopBar.css';

function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

/** Sticky top bar: search (opens ⌘K palette), notifications, Upload a file. Mobile: brand + year + icons + account. */
export function TopBar() {
  const scrolled = useScrolled();
  const startUpload = useStartUpload();
  // The library has its own Upload button: one is enough.
  const { pathname } = useLocation();
  const onLibrary = pathname === '/library';
  return (
    <header className={cx('shell-topbar', scrolled && 'is-scrolled')} data-hub="topbar">
      <div className="shell-topbar__inner">
        <Link to="/" className="shell-brand shell-topbar__brand" aria-label="DSBA Hub home">
          <HubLogo variant="lockup" size={28} decorative />
        </Link>
        <SearchField
          asButton
          className="shell-topbar__search"
          placeholder="Search everything…"
          label="Search everything"
          shortcut="K"
          onClick={() => openCommandPalette()}
          data-hub="search"
        />
        <div className="shell-topbar__actions">
          <YearSwitcher compact menuSide="bottom" className="shell-topbar__year" hookId="year-switcher-mobile" />
          <IconButton className="shell-topbar__search-icon" label="Search" icon={MagnifyingGlass} onClick={() => openCommandPalette()} />
          <ErrorBoundary name="NotificationsMenu" fallback={null}>
            <NotificationsMenu />
          </ErrorBoundary>
          {onLibrary ? null : (
            <Button className="shell-topbar__contribute" leadingIcon={UploadSimple} onClick={() => startUpload()} data-hub="contribute">
              Upload a file
            </Button>
          )}
          <span className="shell-topbar__profile">
            <ProfileMenu placement="topbar" />
          </span>
        </div>
      </div>
    </header>
  );
}
