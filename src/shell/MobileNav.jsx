import { createElement, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, DotsThreeOutline, GithubLogo, Info } from '@phosphor-icons/react';
import { Divider, Drawer, HubMark, cx } from '../ui';
import { CONTRIBUTE_URL } from '../data/people.js';
import { EXTERNAL_LINKS, MOBILE_TAB_IDS, MORE_IDS, NAV } from './nav.js';
import { YearSwitcher } from './YearSwitcher.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import './MobileNav.css';

const TABS = NAV.filter((n) => MOBILE_TAB_IDS.includes(n.id));
const MORE = NAV.filter((n) => MORE_IDS.includes(n.id));

/** Bottom tab bar (< 700px): Home, Modules, Library, Forum, More (drawer with the rest). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const moreActive = [...MORE.map((m) => m.to), '/about', '/styleguide'].some((p) => pathname.startsWith(p));
  const close = () => setOpen(false);
  return (
    <>
      <nav className="shell-tabbar" aria-label="Main">
        {TABS.map((item) => (
          <NavLink key={item.id} to={item.to} end={item.end} className={({ isActive }) => cx('shell-tabbar__item', isActive && 'is-active')} data-hub={`tab-${item.id}`}>
            {({ isActive }) => (
              <>
                <span className="shell-tabbar__mark" aria-hidden="true">{isActive ? <HubMark size={6} animate="draw" dot={false} /> : null}</span>
                <span className="shell-tabbar__icon">
                  {createElement(item.icon, { weight: isActive ? 'duotone' : 'regular', 'aria-hidden': true })}
                  {item.isNew ? <span className="shell-tabbar__newdot" aria-hidden="true" /> : null}
                </span>
                <span className="shell-tabbar__label">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button type="button" className={cx('shell-tabbar__item', moreActive && 'is-active')} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} data-hub="tab-more">
          <span className="shell-tabbar__mark" aria-hidden="true">{moreActive ? <HubMark size={6} dot={false} /> : null}</span>
          <span className="shell-tabbar__icon"><DotsThreeOutline aria-hidden="true" weight={moreActive ? 'fill' : 'regular'} /></span>
          <span className="shell-tabbar__label">More</span>
        </button>
      </nav>

      <Drawer side="bottom" open={open} onClose={close} title="More">
        <div className="shell-more">
          <YearSwitcher hookId="year-switcher-more" />
          <ul role="list" className="shell-more__list">
            {MORE.map((item) => (
              <li key={item.id}>
                <NavLink to={item.to} onClick={close} className={({ isActive }) => cx('shell-more__item', isActive && 'is-active')}>
                  {createElement(item.icon, { 'aria-hidden': true })}
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
            <li>
              <Link to="/about" onClick={close} className="shell-more__item">
                <Info aria-hidden="true" />
                <span>About DSBA Hub</span>
              </Link>
            </li>
          </ul>
          <Divider />
          <ul role="list" className="shell-more__list">
            {[...EXTERNAL_LINKS, { id: 'contribute', label: 'Contribute a resource', href: CONTRIBUTE_URL, icon: GithubLogo }].map((item) => (
              <li key={item.id}>
                <a href={item.href} target="_blank" rel="noopener noreferrer" className="shell-more__item">
                  {createElement(item.icon, { 'aria-hidden': true })}
                  <span>{item.label}<span className="visually-hidden"> (opens in a new tab)</span></span>
                  <ArrowUpRight className="shell-more__ext" aria-hidden="true" weight="bold" />
                </a>
              </li>
            ))}
          </ul>
          <Divider />
          <ThemeToggle />
        </div>
      </Drawer>
    </>
  );
}
