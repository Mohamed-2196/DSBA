import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { CONTRIBUTORS, COPYRIGHT_HOLDER, DISCLAIMER, LAUNCH_YEAR, MYCLASS_URL, UOL_PORTAL_URL } from '../data/people';
import { HubLogo } from '../ui';
import { UPLOAD_PATH, useStartUpload, useUploadShown } from './upload';
import './SiteFooter.css';

/** Footer inside the content column: contributors, links, disclaimer, copyright. */
export function SiteFooter() {
  const { status, me } = useAuth();
  const startUpload = useStartUpload();
  const uploadShown = useUploadShown();
  const current = new Date().getFullYear();
  const range = current > LAUNCH_YEAR ? `${LAUNCH_YEAR}–${current}` : `${LAUNCH_YEAR}`;
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
            <a href={MYCLASS_URL} target="_blank" rel="noopener noreferrer">
              BIBF MyClass
            </a>
            <a href={UOL_PORTAL_URL} target="_blank" rel="noopener noreferrer">
              UoL student portal
            </a>
          </nav>
        </div>
        <p className="shell-footer__affil">Made by DSBA students at BIBF, studying for a University of London degree.</p>
        <ul role="list" className="shell-footer__people" aria-label="Contributors">
          {CONTRIBUTORS.map((c) => (
            <li key={c.id}>
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="shell-footer__name">
                  {c.name}
                </a>
              ) : (
                <span className="shell-footer__name">{c.name}</span>
              )}
              <span className="shell-footer__role">{c.affiliation ? `${c.role}, ${c.affiliation}` : c.role}</span>
            </li>
          ))}
        </ul>
        <div className="shell-footer__legal">
          <p>{DISCLAIMER}</p>
          <p>
            © {range} {COPYRIGHT_HOLDER}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
