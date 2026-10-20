import { Database } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { CareerCert, ModuleSummary } from '../../api/types';
import { BREAKPOINTS, useMediaQuery } from '../../state';
import { useModules } from '../../state/modules';
import { Button, glyph, Icon, PageSection, Panel, SectionHeader, cx } from '../../ui';
import { hostOf } from '../../lib/share';
import { useCareerData } from './context';
import { SHOW_CERT_EVENT, jumpTo } from './lib/jump';
import { libraryLink, webUrl } from './lib/links';
import { LogoSlot } from './LogoSlot';
import { ModuleLink } from './ModuleLink';
import './Certificates.css';

/** Three pips for how heavy the study load is. Light, medium or heavy: a rough guide, not a promise. */
function Effort({ level }: { level: CareerCert['effort'] }) {
  const { effortLabel } = useCareerData();
  const label = effortLabel[String(level)] ?? '';
  return (
    <span className="career-effort" role="img" aria-label={`${label} effort, ${level} of 3`}>
      <span className="career-effort__pips" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx('career-effort__pip', i <= level && 'is-on')} />
        ))}
      </span>
      <span className="career-effort__label" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}

export function CertCard({ cert }: { cert: CareerCert }) {
  const { getModule } = useModules();
  const modules = cert.covers.map((id) => getModule(id)).filter((m): m is ModuleSummary => m !== null);
  const url = webUrl(cert.url);
  const host = hostOf(url);
  return (
    <Panel
      as="li"
      padding="none"
      id={`career-cert-${cert.id}`}
      className="career-cert"
      data-hub="career-cert"
      data-cert-id={cert.id}
    >
      <div className="career-cert__top">
        {url ? (
          <LogoSlot kind="cert" id={cert.id} logo={cert.logo} mono={cert.mono ?? ''} />
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
        <Icon glyph={glyph.timer} size={16} className="career-cert__time-icon" />
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
        {url ? (
          <>
            <Button variant="secondary" size="sm" href={url} trailingIcon={<Icon glyph={glyph.external} />}>
              Official page
              <span className="visually-hidden">{` for ${cert.name}, opens ${host} in a new tab`}</span>
            </Button>
            <span className="career-cert__host" aria-hidden="true">
              {host}
            </span>
          </>
        ) : cert.file ? (
          <Button
            variant="secondary"
            size="sm"
            to={libraryLink(cert.file.module)}
            leadingIcon={<Icon glyph={glyph.page} />}
          >
            Find it in the library
          </Button>
        ) : null}
      </footer>
    </Panel>
  );
}

/** How many certificates a phone shows before "Show all". */
const PHONE_FIRST = 3;

/** Certificates and courses students ask about, each with a logo slot, the effort and what DSBA already covers. */
export function Certificates() {
  const { certs, certNote } = useCareerData();
  // Phones show the first few: each card is most of a screen there.
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const [all, setAll] = useState(false);
  // A skill row asked for a card that is folded away: unfold, then show it.
  const [asked, setAsked] = useState<string | null>(null);
  useEffect(() => {
    const onAsk = (e: Event) => {
      if (!(e instanceof CustomEvent) || typeof e.detail !== 'string') return;
      setAll(true);
      setAsked(e.detail);
    };
    window.addEventListener(SHOW_CERT_EVENT, onAsk);
    return () => window.removeEventListener(SHOW_CERT_EVENT, onAsk);
  }, []);
  useEffect(() => {
    if (!asked) return;
    jumpTo(`career-cert-${asked}`, { flash: true, block: 'center' });
    setAsked(null);
  }, [asked]);
  if (!certs.length) return null;
  const folded = phone && !all && certs.length > PHONE_FIRST;
  const shown = folded ? certs.slice(0, PHONE_FIRST) : certs;
  return (
    <PageSection
      id="career-certificates"
      className="career-certs"
      aria-labelledby="career-certs-title"
      data-hub="career-certs"
    >
      <SectionHeader
        id="career-certs-title"
        title="Certificates and courses"
        description="What each one is good for, how much work it takes and which DSBA modules already cover part of it."
      />
      <ul role="list" className="career-certs__grid">
        {shown.map((c) => (
          <CertCard key={c.id} cert={c} />
        ))}
      </ul>
      {phone && certs.length > PHONE_FIRST ? (
        <div className="career-opps__more">
          <Button
            variant="secondary"
            trailingIcon={<Icon glyph={folded ? glyph.chevronDown : glyph.chevronUp} />}
            aria-expanded={!folded}
            onClick={() => setAll(folded)}
          >
            {folded ? `Show all ${certs.length} certificates` : 'Show fewer'}
          </Button>
        </div>
      ) : null}
      {certNote ? <p className="career-note">{certNote}</p> : null}
    </PageSection>
  );
}
