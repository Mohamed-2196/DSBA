import { createElement } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { useAuth } from '../auth';
import { BREAKPOINTS, useMediaQuery } from '../state';
import { Badge, BrandLogo, HubLogo, Tooltip, cx } from '../ui';
import { NAV, type NavItem as NavConfig } from './nav';
import { usePortalLinks, type PortalLink } from './portals';
import { visibleNav } from './visibility';
import { YearSwitcher } from './YearSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { ProfileMenu } from './ProfileMenu';
import './Sidebar.css';

function NavItem({ item, collapsed }: { item: NavConfig; collapsed: boolean }) {
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cx('shell-nav__item', isActive && 'is-active')}
      aria-label={collapsed ? (item.isNew ? `${item.label} (new)` : item.label) : undefined}
      data-hub={`nav-${item.id}`}
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

function ExternalItem({ item, collapsed }: { item: PortalLink; collapsed: boolean }) {
  const a = (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="shell-nav__item shell-nav__item--ext"
      aria-label={`${item.label} (opens in a new tab)`}
      data-hub={`ext-${item.id}`}
    >
      <span className="shell-nav__icon">
        <BrandLogo name={item.logo} height={collapsed ? 20 : item.logoHeight ?? 18} decorative />
      </span>
      <span className="shell-nav__label">{item.label}</span>
      <ArrowSquareOut className="shell-nav__out" aria-hidden="true" />
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

/**
 * Left rail: the brand and year switcher at the top and the theme and account at the bottom stay put; only the nav
 * (with the outside links after it) scrolls between them, so the account is always in reach at any zoom. Icon-only
 * at 700–1099px.
 */
export function Sidebar() {
  const collapsed = useMediaQuery(BREAKPOINTS.tablet);
  const { featureOn, me } = useAuth();
  const portals = usePortalLinks();
  return (
    // The column wrapper runs the full page height (surface + border); the rail inside is sticky.
    <div className="shell-rail-col">
      <aside className={cx('shell-rail', collapsed && 'is-collapsed')} data-hub="sidebar" aria-label="Sidebar">
        <div className="shell-rail__brand">
          <Link to="/" className="shell-brand" aria-label="DSBA Hub home" data-hub="brand">
            <HubLogo variant={collapsed ? 'tile' : 'lockup'} size={collapsed ? 32 : 36} textInset={6} decorative />
          </Link>
        </div>

        <div className="shell-rail__year">
          <YearSwitcher compact={collapsed} />
        </div>

        <div className="shell-rail__scroll">
          <nav className="shell-nav" aria-label="Main">
            <ul role="list">
              {visibleNav(NAV, featureOn, !!me).map((item) => (
                <li key={item.id}>
                  <NavItem item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </nav>

          <nav className="shell-rail__links" aria-label="Student portals">
            <ul role="list">
              {portals.map((item) => (
                <li key={item.id}>
                  <ExternalItem item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="shell-rail__foot">
          <ThemeToggle compact={collapsed} />
          <ProfileMenu compact={collapsed} />
        </div>
      </aside>
    </div>
  );
}
