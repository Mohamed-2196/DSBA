import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GithubLogo, MagnifyingGlass } from '@phosphor-icons/react';
import { Button, ErrorBoundary, IconButton, HubMark, SearchField, cx } from '../ui';
import { CONTRIBUTE_URL } from '../data/people.js';
import { openCommandPalette } from '../features/search/public.js';
import { NotificationsMenu } from '../features/notifications/public.js';
import { YearSwitcher } from './YearSwitcher.jsx';
import './TopBar.css';

function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

/** Sticky top bar: search (opens ⌘K palette), notifications, Contribute. Mobile: brand + year + icons. */
export function TopBar() {
  const scrolled = useScrolled();
  return (
    <header className={cx('shell-topbar', scrolled && 'is-scrolled')} data-hub="topbar">
      <div className="shell-topbar__inner">
        <Link to="/" className="shell-brand shell-topbar__brand" aria-label="DSBA Hub home">
          <HubMark tile size={28} />
          <span className="shell-brand__name">DSBA Hub</span>
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
          <Button className="shell-topbar__contribute" href={CONTRIBUTE_URL} leadingIcon={GithubLogo} data-hub="contribute">
            Contribute
          </Button>
        </div>
      </div>
    </header>
  );
}
