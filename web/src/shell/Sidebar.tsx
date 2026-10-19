import { Link, NavLink } from 'react-router-dom';
import { BREAKPOINTS, useMediaQuery } from '../state';
import { Badge, BrandLogo, HubLogo, Icon, Tooltip, cx, glyph } from '../ui';
import { NooraFace } from '../features/noora/public';
import { type NavItem as NavConfig } from './nav';
import { usePortalLinks, type PortalLink } from './portals';
import { useShownNav } from './useShownNav';
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
      data-section={item.section}
    >
      {({ isActive }) => (
        <>
          <span className="shell-nav__icon">
            {/* Noora is a person, not a section: her face stands where an icon would. */}
            {item.id === 'noora' ? (
              <NooraFace size={22} className="shell-nav__face" />
            ) : (
              <Icon glyph={item.icon} size={20} active={isActive} />
            )}
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
        <BrandLogo name={item.logo} height={collapsed ? 20 : (item.logoHeight ?? 18)} decorative />
      </span>
      <span className="shell-nav__label">{item.label}</span>
      <Icon glyph={glyph.external} size={16} className="shell-nav__out" />
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
  const nav = useShownNav();
  const main = nav.filter((item) => item.group === 'main');
  const tools = nav.filter((item) => item.group === 'tools');
  const portals = usePortalLinks();
  return (
    // The column wrapper runs the full page height (surface + border); the rail inside is sticky.
    <div className="shell-rail-col">
      <aside className={cx('shell-rail', collapsed && 'is-collapsed')} data-hub="sidebar" aria-label="Sidebar">
        <div className="shell-rail__brand">
          <Link to="/" className="shell-brand" aria-label="DSBA Hub home" data-hub="brand">
            <HubLogo variant={collapsed ? 'tile' : 'lockup'} size={collapsed ? 32 : 39} textInset={6} decorative />
          </Link>
        </div>

        <div className="shell-rail__year">
          <YearSwitcher compact={collapsed} />
        </div>

        <div className="shell-rail__scroll">
          <nav className="shell-nav" aria-label="Main">
            <ul role="list">
              {main.map((item) => (
                <li key={item.id}>
                  <NavItem item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
            {tools.length ? (
              <>
                <p className={cx('shell-nav__group', collapsed && 'visually-hidden')} id="shell-nav-tools">
                  Tools
                </p>
                <ul role="list" aria-labelledby="shell-nav-tools">
                  {tools.map((item) => (
                    <li key={item.id}>
                      <NavItem item={item} collapsed={collapsed} />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
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
