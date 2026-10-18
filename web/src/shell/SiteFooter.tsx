import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { contributorLine, copyrightYears, httpsHref, useSite } from '../features/site/public';
import { shortVersion } from '../lib/version';
import { HubLogo } from '../ui';
import { UPLOAD_PATH, useStartUpload, useUploadShown } from './upload';
import './SiteFooter.css';

/** Footer inside the content column: links, who makes the hub, contributors, disclaimer, copyright (Site settings). */
export function SiteFooter() {
  const { status, me } = useAuth();
  const startUpload = useStartUpload();
  const uploadShown = useUploadShown();
  const site = useSite().data;
  return (
    <footer className="shell-footer">
      <div className="shell-footer__inner">
        <div className="shell-footer__top">
          <Link to="/about" className="shell-footer__brand" aria-label="About DSBA Hub">
            <HubLogo variant="lockup" size={24} decorative />
          </Link>
          <nav aria-label="Footer" className="shell-footer__links">
            <Link to="/about">About</Link>
            {uploadShown ? (
              <Link
                to={UPLOAD_PATH}
                onClick={(e) => {
                  // A guest signs in first, then carries on to the upload.
                  if (status === 'signed-in' && me && !me.needsProfile) return;
                  e.preventDefault();
                  startUpload();
                }}
              >
                Upload a file
              </Link>
            ) : null}
            {site
              ? [site.links.myclass, site.links.uolPortal].map((l) => {
                  const href = httpsHref(l.url);
                  return href ? (
                    <a key={l.label} href={href} target="_blank" rel="noopener noreferrer">
                      {l.label}
                    </a>
                  ) : null;
                })
              : null}
          </nav>
        </div>
        {site ? (
          <>
            <p className="shell-footer__affil">{site.tagline}</p>
            {site.contributors.length ? (
              <ul role="list" className="shell-footer__people" aria-label="Contributors">
                {site.contributors.map((c) => (
                  <li key={c.id}>
                    {httpsHref(c.url) ? (
                      <a
                        href={httpsHref(c.url) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shell-footer__name"
                      >
                        {c.name}
                      </a>
                    ) : (
                      <span className="shell-footer__name">{c.name}</span>
                    )}
                    {contributorLine(c) ? <span className="shell-footer__role">{contributorLine(c)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="shell-footer__legal">
              <p>{site.disclaimer}</p>
              <p>
                © {copyrightYears(site.launchYear)} {site.copyrightHolder}. All rights reserved.
              </p>
              <p>Version {shortVersion(__APP_VERSION__)}</p>
            </div>
          </>
        ) : null}
      </div>
    </footer>
  );
}
