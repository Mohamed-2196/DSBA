import { Link } from 'react-router-dom';
import { CONTRIBUTORS, CONTRIBUTE_URL, COPYRIGHT_HOLDER, DISCLAIMER, LAUNCH_YEAR, MYCLASS_URL, UOL_PORTAL_URL } from '../data/people.js';
import { ProgrammeLockup, PulseMark } from '../ui';
import './SiteFooter.css';

/** Footer inside the content column: v1 contributors, links, disclaimer, copyright. */
export function SiteFooter() {
  const current = new Date().getFullYear();
  const range = current > LAUNCH_YEAR ? `${LAUNCH_YEAR}–${current}` : `${LAUNCH_YEAR}`;
  return (
    <footer className="shell-footer">
      <div className="shell-footer__inner">
        <div className="shell-footer__top">
          <Link to="/about" className="shell-footer__brand" aria-label="About DSBA Pulse">
            <PulseMark tile size={24} />
            <span>DSBA Pulse</span>
          </Link>
          <nav aria-label="Footer" className="shell-footer__links">
            <Link to="/about">About</Link>
            <a href={CONTRIBUTE_URL} target="_blank" rel="noopener noreferrer">Contribute a resource</a>
            <a href={MYCLASS_URL} target="_blank" rel="noopener noreferrer">BIBF MyClass</a>
            <a href={UOL_PORTAL_URL} target="_blank" rel="noopener noreferrer">UoL student portal</a>
          </nav>
        </div>
        <ProgrammeLockup className="shell-footer__affil">
          Made by DSBA students at BIBF, studying for a University of London degree.
        </ProgrammeLockup>
        <ul role="list" className="shell-footer__people" aria-label="Contributors">
          {CONTRIBUTORS.map((c) => (
            <li key={c.id}>
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="shell-footer__name">{c.name}</a>
              ) : (
                <span className="shell-footer__name">{c.name}</span>
              )}
              <span className="shell-footer__role">{c.affiliation ? `${c.role}, ${c.affiliation}` : c.role}</span>
            </li>
          ))}
        </ul>
        <div className="shell-footer__legal">
          <p>{DISCLAIMER}</p>
          <p>© {range} {COPYRIGHT_HOLDER}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
