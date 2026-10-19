import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { BrandLogo, Divider, Drawer, Icon, cx, glyph } from '../ui';
import { openBugReport } from '../features/bugs/public';
import { NooraFace } from '../features/noora/public';
import { MOBILE_TAB_IDS, MORE_IDS } from './nav';
import { usePortalLinks } from './portals';
import { useShownNav } from './useShownNav';
import { YearSwitcher } from './YearSwitcher';
import { InstallSteps } from './InstallSteps';
import { useInstallOffer } from './useInstallOffer';
import { ThemeToggle } from './ThemeToggle';
import { useStartUpload, useUploadShown } from './upload';
import './MobileNav.css';

/** Bottom tab bar (< 700px): Home, Modules, Noora, Library, Forum, More (drawer with the rest). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const startUpload = useStartUpload();
  const uploadShown = useUploadShown();
  const portals = usePortalLinks();
  const install = useInstallOffer();
  const nav = useShownNav();
  const tabs = nav.filter((n) => MOBILE_TAB_IDS.includes(n.id));
  const more = nav.filter((n) => MORE_IDS.includes(n.id));
  const moreActive = [...more.map((m) => m.to), '/about', '/styleguide'].some((p) => pathname.startsWith(p));
  const close = () => setOpen(false);
  return (
    <>
      <nav className="shell-tabbar" aria-label="Main">
        {tabs.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cx('shell-tabbar__item', isActive && 'is-active')}
            data-hub={`tab-${item.id}`}
            data-section={item.section}
          >
            {({ isActive }) => (
              <>
                <span className="shell-tabbar__icon">
                  {/* Noora's tab shows her face: on a phone this is where Mini Noora waits. */}
                  {item.id === 'noora' ? (
                    <NooraFace size={26} className="shell-tabbar__face" />
                  ) : (
                    <Icon glyph={item.icon} size={24} active={isActive} />
                  )}
                  {item.isNew ? <span className="shell-tabbar__newdot" aria-hidden="true" /> : null}
                </span>
                <span className="shell-tabbar__label">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          className={cx('shell-tabbar__item', moreActive && 'is-active')}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-hub="tab-more"
          data-section="tools"
        >
          <span className="shell-tabbar__icon">
            <Icon glyph={glyph.moreTab} size={24} active={moreActive} />
          </span>
          <span className="shell-tabbar__label">More</span>
        </button>
      </nav>

      <Drawer side="bottom" open={open} onClose={close} title="More">
        <div className="shell-more">
          <YearSwitcher hookId="year-switcher-more" />
          <ul role="list" className="shell-more__list">
            {more.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.to}
                  onClick={close}
                  className={({ isActive }) => cx('shell-more__item', isActive && 'is-active')}
                  data-section={item.section}
                >
                  {({ isActive }) => (
                    <>
                      <Icon glyph={item.icon} size={20} active={isActive} />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
            {uploadShown ? (
              <li>
                <button
                  type="button"
                  className="shell-more__item"
                  onClick={() => {
                    close();
                    startUpload();
                  }}
                  data-hub="more-upload"
                >
                  <Icon glyph={glyph.upload} size={20} />
                  <span>Upload a file</span>
                </button>
              </li>
            ) : null}
            {install.way ? (
              <li>
                <button
                  type="button"
                  className="shell-more__item"
                  onClick={() => {
                    close();
                    install.start();
                  }}
                  data-hub="more-install"
                >
                  <Icon glyph={glyph.download} size={20} />
                  <span>Install the app</span>
                </button>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                className="shell-more__item"
                onClick={() => {
                  close();
                  openBugReport();
                }}
                data-hub="more-bug"
              >
                <Icon glyph={glyph.flag} size={20} />
                <span>Report a bug</span>
              </button>
            </li>
            <li>
              <Link to="/about" onClick={close} className="shell-more__item">
                <Icon glyph={glyph.info} size={20} />
                <span>About DSBA Hub</span>
              </Link>
            </li>
          </ul>
          <Divider />
          <ul role="list" className="shell-more__list">
            {portals.map((item) => (
              <li key={item.id}>
                <a href={item.href} target="_blank" rel="noopener noreferrer" className="shell-more__item">
                  <BrandLogo name={item.logo} height={item.logoHeight ?? 20} decorative />
                  <span>
                    {item.label}
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </span>
                  <Icon glyph={glyph.external} size={16} className="shell-more__ext" />
                </a>
              </li>
            ))}
          </ul>
          <Divider />
          <ThemeToggle />
        </div>
      </Drawer>
      <InstallSteps offer={install} />
    </>
  );
}
