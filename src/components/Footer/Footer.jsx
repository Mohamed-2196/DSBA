import { useState } from 'react';
import './Footer.css';

const REPO_URL = 'https://github.com/Mohamed-2196/DSBA';
const LAUNCH_YEAR = 2024;

const contributors = [
  {
    name: 'Mohamed Alnooh',
    role: 'Creator & maintainer',
    login: 'Mohamed-2196',
    avatar: 'https://avatars.githubusercontent.com/u/145868671?v=4',
  },
];

const getInitials = (name) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const Footer = () => {
  const [failedAvatars, setFailedAvatars] = useState([]);
  const currentYear = new Date().getFullYear();
  const yearRange =
    currentYear > LAUNCH_YEAR ? `${LAUNCH_YEAR}–${currentYear}` : `${LAUNCH_YEAR}`;

  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-brand">
          <h3 className="footer-title">DSBA Resource Hub</h3>
          <p className="footer-tagline">
            A curated collection of Data Science and Business Analytics learning
            resources for University of London students.
          </p>
          <a className="footer-repo-link" href={REPO_URL} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </div>

        <div className="footer-contributors">
          <h4 className="footer-heading">Contributors</h4>
          <ul className="contributor-list">
            {contributors.map((contributor) => (
              <li key={contributor.login} className="contributor">
                <a
                  className="contributor-link"
                  href={`https://github.com/${contributor.login}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`@${contributor.login} on GitHub`}
                >
                  {failedAvatars.includes(contributor.login) ? (
                    <span className="contributor-avatar contributor-initials" aria-hidden="true">
                      {getInitials(contributor.name)}
                    </span>
                  ) : (
                    <img
                      className="contributor-avatar"
                      src={contributor.avatar}
                      alt={contributor.name}
                      width="40"
                      height="40"
                      loading="lazy"
                      onError={() =>
                        setFailedAvatars((failed) => [...failed, contributor.login])
                      }
                    />
                  )}
                  <span className="contributor-details">
                    <span className="contributor-name">{contributor.name}</span>
                    <span className="contributor-role">{contributor.role}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <a
            className="footer-contribute"
            href={`${REPO_URL}/issues/new`}
            target="_blank"
            rel="noreferrer"
          >
            Got a resource to share? Contribute →
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <p className="footer-copyright">
          © {yearRange} Mohamed Alnooh. All rights reserved.
        </p>
        <p className="footer-disclaimer">
          A student-run project. Not affiliated with or endorsed by the University
          of London. All linked materials belong to their respective owners.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
