import { ArrowUpRight, Compass, FileText } from '@phosphor-icons/react';
import { getModule } from '../../data/modules.js';
import { Badge, Button, PageSection, Panel, SectionHeader, cx } from '../../ui';
import { CERTS, CERT_NOTE, EFFORT_LABEL } from './data/certificates.js';
import { jumpTo } from './lib/jump.js';
import { fileLink } from './lib/links.js';
import { ModuleLink } from './ModuleLink.jsx';
import './Certificates.css';

/** Three pips for how heavy the study load is. Light, medium or heavy: a rough guide, not a promise. */
function Effort({ level }) {
  return (
    <span className="career-effort" role="img" aria-label={`${EFFORT_LABEL[level]} effort, ${level} of 3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx('career-effort__pip', i <= level && 'is-on')} />
      ))}
    </span>
  );
}

function CertCard({ cert, role }) {
  const fits = cert.roles.includes(role.id);
  const modules = cert.covers.map((id) => getModule(id)).filter(Boolean);
  return (
    <Panel as="li" padding="none" id={`career-cert-${cert.id}`} className="career-cert" data-hub="career-cert" data-cert-id={cert.id}>
      <header className="career-cert__head">
        <h3 className="career-cert__name">{cert.name}</h3>
        <div className="career-cert__sub">
          <p className="career-cert__issuer">{cert.issuer}</p>
          {fits ? <Badge tone="cobalt">{`Fits ${role.label}`}</Badge> : null}
        </div>
      </header>

      <p className="career-cert__effort">
        <Effort level={cert.effort} />
        <span>
          <strong>{EFFORT_LABEL[cert.effort]} effort.</strong> {cert.effortNote}
        </span>
      </p>

      <dl className="career-cert__facts">
        <div>
          <dt>Who it suits</dt>
          <dd>{cert.suits}</dd>
        </div>
        <div>
          <dt>Before you start</dt>
          <dd>{cert.before}</dd>
        </div>
        <div>
          <dt>Already in DSBA</dt>
          <dd>
            {modules.length ? (
              <ul role="list" className="career-cert__mods">
                {modules.map((m) => (
                  <li key={m.id}>
                    <ModuleLink module={m} />
                  </li>
                ))}
              </ul>
            ) : null}
            {cert.coversNote ? <p className="career-cert__covers-note">{cert.coversNote}</p> : null}
          </dd>
        </div>
      </dl>

      <footer className="career-cert__foot">
        <p className="career-cert__fine">{cert.url ? CERT_NOTE : 'Not an exam, so there are no fees or dates to check.'}</p>
        {cert.url ? (
          <Button variant="secondary" size="sm" href={cert.url} trailingIcon={ArrowUpRight}>
            Official site
            <span className="visually-hidden">{` for ${cert.name}, opens in a new tab`}</span>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" to={fileLink(cert.file.module, cert.file.id)} leadingIcon={FileText}>
            Open the SQL notebook
          </Button>
        )}
      </footer>
    </Panel>
  );
}

/** The credentials students ask about, with what each asks for and what DSBA already covers. No prices, no dates. */
export function Certificates({ role }) {
  return (
    <PageSection id="career-certificates" className="career-certs" aria-labelledby="career-certs-title" data-hub="career-certs">
      <SectionHeader
        id="career-certs-title"
        title="Certificates and requirements"
        description="What each one asks for, how much work it is and which DSBA modules already cover part of it."
      />
      <ul role="list" className="career-certs__grid">
        {CERTS.map((c) => (
          <CertCard key={c.id} cert={c} role={role} />
        ))}
        <Panel as="li" tone="inset" padding="none" className="career-certs__guide">
          <Compass className="career-certs__guide-icon" weight="duotone" aria-hidden="true" />
          <h3 className="career-certs__guide-title">Not sure which first?</h3>
          <p className="career-certs__guide-body">
            Pick a role in Role fit. The certificates that suit it are marked here, and a gap a certificate can close links to its card.
          </p>
          <Button variant="secondary" size="sm" onClick={() => jumpTo('career-role-fit')}>
            Back to role fit
          </Button>
        </Panel>
      </ul>
    </PageSection>
  );
}
