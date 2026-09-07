import './Footer.css';

const REPO_URL = 'https://github.com/Mohamed-2196/DSBA';
const LAUNCH_YEAR = 2024;

const contributors = [
  {
    name: 'Mohamed Alnooh',
    role: 'Creator & maintainer',
    login: 'Mohamed-2196',
  },
  {
    name: 'Feras Alsadadi',
    role: 'Historical past exams',
  },
];

const Footer = () => {
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
              <li key={contributor.name} className="contributor">
                {contributor.login ? (
                  <a
                    className="contributor-name contributor-link"
                    href={`https://github.com/${contributor.login}`}
                    target="_blank"
                    rel="noreferrer"
                    title={`@${contributor.login} on GitHub`}
                  >
                    {contributor.name}
                  </a>
                ) : (
                  <span className="contributor-name">{contributor.name}</span>
                )}
                <span className="contributor-role">{contributor.role}</span>
              </li>
            ))}
            <li className="contributor contributor-thanks">
              And everyone who shared their notes with the community — thank you.
            </li>
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
