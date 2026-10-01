import { createElement } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowUpRight } from '@phosphor-icons/react';
import { BREAKPOINTS, useMediaQuery } from '../state';
import { Badge, PulseMark, Tooltip, cx } from '../ui';
import { EXTERNAL_LINKS, NAV } from './nav.js';
import { YearSwitcher } from './YearSwitcher.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { ProfileMenu } from './ProfileMenu.jsx';
import './Sidebar.css';

function NavItem({ item, collapsed }) {
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cx('shell-nav__item', isActive && 'is-active')}
      aria-label={collapsed ? (item.isNew ? `${item.label} (new)` : item.label) : undefined}
      data-pulse={`nav-${item.id}`}
    >
      {({ isActive }) => (
        <>
          <span className="shell-nav__icon">
            {createElement(item.icon, { weight: isActive ? 'duotone' : 'regular', 'aria-hidden': true })}
            {item.isNew ? <span className="shell-nav__newdot" aria-hidden="true" /> : null}
          </span>
          <span className="shell-nav__label">{item.label}</span>
          {item.isNew ? (
            <Badge tone="highlight" size="sm" className="shell-nav__new">
              New
            </Badge>
          ) : null}
          {isActive ? <PulseMark size={10} animate="draw" className="shell-nav__pulse" /> : null}
        </>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip label={item.label} side="right" describe={false} className="shell-nav__tip">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function ExternalItem({ item, collapsed }) {
  const a = (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className="shell-nav__item shell-nav__item--ext" aria-label={collapsed ? `${item.label} (opens in a new tab)` : undefined}>
      <span className="shell-nav__icon">{createElement(item.icon, { 'aria-hidden': true })}</span>
      <span className="shell-nav__label">
        {item.label}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </span>
      <ArrowUpRight className="shell-nav__ext" aria-hidden="true" weight="bold" />
    </a>
  );
  return collapsed ? (
    <Tooltip label={`${item.label}, opens in a new tab`} side="right" describe={false} className="shell-nav__tip">
      {a}
    </Tooltip>
  ) : (
    a
  );
}

/** Left rail: brand, year switcher, nav, external links, theme, profile. Icon-only at 700–1099px. */
export function Sidebar() {
  const collapsed = useMediaQuery(BREAKPOINTS.tablet);
  return (
    // The column wrapper runs the full page height (surface + border); the rail inside is sticky.
    <div className="shell-rail-col">
      <aside className={cx('shell-rail', collapsed && 'is-collapsed')} data-pulse="sidebar" aria-label="Sidebar">
        <div className="shell-rail__brand">
          <Link to="/" className="shell-brand" aria-label="DSBA Pulse home" data-pulse="brand">
            <PulseMark tile size={32} />
            <span className="shell-brand__name">DSBA Pulse</span>
          </Link>
        </div>

        <div className="shell-rail__year">
          <YearSwitcher compact={collapsed} />
        </div>

        <nav className="shell-nav" aria-label="Main">
          <ul role="list">
            {NAV.map((item) => (
              <li key={item.id}>
                <NavItem item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="shell-rail__grow" />

        <div className="shell-rail__links">
          <ul role="list">
            {EXTERNAL_LINKS.map((item) => (
              <li key={item.id}>
                <ExternalItem item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </div>

        <div className="shell-rail__foot">
          <ThemeToggle compact={collapsed} />
          <ProfileMenu compact={collapsed} />
        </div>
      </aside>
    </div>
  );
}
