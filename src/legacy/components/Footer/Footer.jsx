import './Footer.css';

const REPO_URL = 'https://github.com/Mohamed-2196/DSBA';
const LAUNCH_YEAR = 2024;

const contributors = [
  {
    name: 'Mohamed Alnooh',
    role: 'Creator & maintainer',
    url: 'https://github.com/Mohamed-2196',
  },
  {
    name: 'Feras Alsadadi',
    role: 'Historical past exams',
  },
  {
    name: 'Yaser Alghsara',
    role: 'BIBF faculty — lecture recordings',
  },
  {
    name: 'Dr. Sayed Hasan Kadhem',
    role: 'BIBF faculty — lecture recordings',
  },
];

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const yearRange =
    currentYear > LAUNCH_YEAR ? `${LAUNCH_YEAR}–${currentYear}` : `${LAUNCH_YEAR}`;

  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-contributors">
          <h4 className="footer-heading">Contributors</h4>
          <ul className="contributor-list">
            {contributors.map((contributor) => (
              <li key={contributor.name} className="contributor">
                {contributor.url ? (
                  <a
                    className="contributor-name contributor-link"
                    href={contributor.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {contributor.name}
                  </a>
                ) : (
                  <span className="contributor-name">{contributor.name}</span>
                )}
                <span className="contributor-role">{contributor.role}</span>
              </li>
            ))}
          </ul>

          <a
            className="footer-org"
            href="https://myclass.bibf.com"
            target="_blank"
            rel="noreferrer"
          >
            <img className="footer-org-logo" src="BIBF_logo.png" alt="BIBF" />
          </a>

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
