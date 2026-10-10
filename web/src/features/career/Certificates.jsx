import { ArrowUpRight, Database, FileText, Timer } from '@phosphor-icons/react';
import { getModule } from '../../data/modules';
import { Button, PageSection, Panel, SectionHeader, cx } from '../../ui';
import { CERTS, CERT_NOTE, EFFORT_LABEL } from './data/certificates';
import { hostOf } from './data/employers';
import { fileLink } from './lib/links';
import { LogoSlot } from './LogoSlot';
import { ModuleLink } from './ModuleLink';
import './Certificates.css';

/** Three pips for how heavy the study load is. Light, medium or heavy: a rough guide, not a promise. */
function Effort({ level }) {
  return (
    <span className="career-effort" role="img" aria-label={`${EFFORT_LABEL[level]} effort, ${level} of 3`}>
      <span className="career-effort__pips" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx('career-effort__pip', i <= level && 'is-on')} />
        ))}
      </span>
      <span className="career-effort__label" aria-hidden="true">
        {EFFORT_LABEL[level]}
      </span>
    </span>
  );
}

function CertCard({ cert }) {
  const modules = cert.covers.map((id) => getModule(id)).filter(Boolean);
  const host = cert.url ? hostOf(cert.url) : null;
  return (
    <Panel as="li" padding="none" id={`career-cert-${cert.id}`} className="career-cert" data-hub="career-cert" data-cert-id={cert.id}>
      <div className="career-cert__top">
        {cert.url ? (
          <LogoSlot kind="cert" id={cert.id} mono={cert.mono} />
        ) : (
          // Self-study has no issuer and so no logo: a generic icon keeps the same box.
          <span className="career-cert__icon" aria-hidden="true">
            <Database weight="duotone" />
          </span>
        )}
        <Effort level={cert.effort} />
      </div>

      <header className="career-cert__head">
        <h3 className="career-cert__name">{cert.name}</h3>
        <p className="career-cert__issuer">{cert.issuer}</p>
      </header>

      <p className="career-cert__good">{cert.goodFor}</p>
      <p className="career-cert__time">
        <Timer className="career-cert__time-icon" aria-hidden="true" />
        {cert.effortNote}
      </p>

      <div className="career-cert__covers">
        <p className="career-cert__label">Already in DSBA</p>
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
      </div>

      <footer className="career-cert__foot">
        {cert.url ? (
          <>
            <Button variant="secondary" size="sm" href={cert.url} trailingIcon={ArrowUpRight}>
              Official page
              <span className="visually-hidden">{` for ${cert.name}, opens ${host} in a new tab`}</span>
            </Button>
            <span className="career-cert__host" aria-hidden="true">
              {host}
            </span>
          </>
        ) : (
          <Button variant="secondary" size="sm" to={fileLink(cert.file.module, cert.file.id)} leadingIcon={FileText}>
            Open the SQL notebook
          </Button>
        )}
      </footer>
    </Panel>
  );
}

/** Certificates and courses students ask about, each with a logo slot, the effort and what DSBA already covers. */
export function Certificates() {
  return (
    <PageSection id="career-certificates" className="career-certs" aria-labelledby="career-certs-title" data-hub="career-certs">
      <SectionHeader
        id="career-certs-title"
        title="Certificates and courses"
        description="What each one is good for, how much work it takes and which DSBA modules already cover part of it."
      />
      <ul role="list" className="career-certs__grid">
        {CERTS.map((c) => (
          <CertCard key={c.id} cert={c} />
        ))}
      </ul>
      <p className="career-note">{CERT_NOTE}</p>
    </PageSection>
  );
}
