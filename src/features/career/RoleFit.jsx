import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  Certificate,
  ChartBar,
  ChartPieSlice,
  ChatsCircle,
  Cpu,
  FileText,
  Flask,
  Handshake,
  PlayCircle,
  ShieldWarning,
  Target,
  Trophy,
  TrendUp,
} from '@phosphor-icons/react';
import { cohortColor, cohortLabel } from '../../state';
import { Badge, Button, Chip, PageSection, Panel, ProgressRing, cx } from '../../ui';
import { CERTS } from './data/certificates.js';
import { ROLES } from './data/roles.js';
import { evaluateRole } from './lib/fit.js';
import { jumpTo } from './lib/jump.js';
import { askLink, resolveClose } from './lib/links.js';
import { ModuleLink } from './ModuleLink.jsx';
import './RoleFit.css';

const ROLE_ICONS = {
  'data-analyst': ChartBar,
  'data-scientist': Flask,
  'business-analyst': Briefcase,
  'bi-developer': ChartPieSlice,
  'risk-analyst': ShieldWarning,
  'financial-analyst': TrendUp,
  'ml-engineer': Cpu,
  'product-analyst': Target,
  consultant: Handshake,
};

const GROUPS = [
  { status: 'covered', title: 'Covered by your modules so far' },
  { status: 'later', title: 'Coming in later years' },
  { status: 'gap', title: 'Gaps to close on your own' },
];

const CLOSE_ICONS = { lesson: PlayCircle, file: FileText, cert: Certificate, forum: ChatsCircle, opps: Trophy };

/** Three steps of depth: filled = taught in a module you have reached, outlined = taught in a later year. */
function Meter({ solid, ghost, label }) {
  return (
    <span className="career-meter" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cx('career-meter__seg', i < solid ? 'is-solid' : i < solid + ghost ? 'is-ghost' : null)} />
      ))}
    </span>
  );
}

function meterLabel(row) {
  if (row.status === 'later') return `${row.label}: ${row.total} of 3 steps once taught`;
  return `${row.label}: ${row.status === 'gap' ? row.total : row.solid} of 3 steps`;
}

/** The one thing to do about a gap: a link into the app, or a button that scrolls to the right card. */
function CloseAction({ close }) {
  const Icon = CLOSE_ICONS[close.kind] || ArrowRight;
  const body = (
    <>
      <Icon className="career-close__icon" weight="regular" aria-hidden="true" />
      <span className="career-close__text">
        <span className="visually-hidden">Suggested next step: </span>
        {close.text}
      </span>
      <ArrowRight className="career-close__go" weight="bold" aria-hidden="true" />
    </>
  );
  if (close.to) {
    return (
      <Link to={close.to} className="career-close">
        {body}
      </Link>
    );
  }
  // A certificate card, or the CFA Research Challenge row (the board's one real listing), or the board itself when a filter hides it.
  const go = () => {
    if (close.cert) jumpTo(`career-cert-${close.cert}`, { flash: true, block: 'center' });
    else if (!jumpTo('career-opp-cfa-research-challenge', { flash: true, block: 'center' })) jumpTo('career-opportunities');
  };
  return (
    <button type="button" className="career-close" onClick={go}>
      {body}
    </button>
  );
}

function SkillRow({ row, roleId }) {
  const close = row.status === 'gap' ? resolveClose(row.id, roleId) : null;
  return (
    <li className={cx('career-skill', `is-${row.status}`)} data-hub="career-skill" data-skill-id={row.id} data-skill-status={row.status}>
      <div className="career-skill__name">{row.skill.name}</div>
      <div className="career-skill__level">
        <Meter solid={row.solid} ghost={row.ghost} label={meterLabel(row)} />
        <span className="career-skill__label" aria-hidden="true">{row.label}</span>
      </div>
      {row.status === 'gap' ? (
        <div className="career-skill__gap">
          <p className="career-skill__detail">{row.detail}</p>
          {close ? <CloseAction close={close} /> : null}
        </div>
      ) : (
        <>
          <p className="career-skill__detail">{row.detail}</p>
          <div className="career-skill__mods">
            {row.named.map((n) => (
              <ModuleLink key={n.module} module={n.mod} />
            ))}
          </div>
        </>
      )}
    </li>
  );
}

/** What is left after the covered skills, one short line each. */
function subline(fit) {
  const lines = [];
  if (fit.later.length) {
    const years = new Set(fit.later.map((r) => r.from));
    const when = years.size === 1 ? `Year ${[...years][0]}` : 'later years';
    lines.push(`${fit.later.length} more in ${when}`);
  }
  if (fit.gaps.length) lines.push(`${fit.gaps.length} to close on your own`);
  return lines.length ? lines : ['Every skill is covered by your modules.'];
}

/**
 * The signature element: pick a role, see which of its skills the student's modules already cover (counting
 * modules up to `year`), which arrive later, and which are theirs to close.
 */
export function RoleFit({ role, onSelect, year }) {
  const fit = useMemo(() => evaluateRole(role, year), [role, year]);
  // The skills table eases in only when the student picks another role, never on arrival.
  const [swapped, setSwapped] = useState(false);
  const n = fit.covered.length;
  const cohort = cohortLabel(year);
  const Icon = ROLE_ICONS[role.id];
  const fitCerts = useMemo(() => CERTS.filter((c) => c.roles.includes(role.id)), [role]);

  return (
    <PageSection className="career-fit-section" id="career-role-fit" aria-label="Role fit">
      <div className="career-roles" role="group" aria-label="Choose a role">
        {ROLES.map((r) => (
          <Chip
            key={r.id}
            icon={ROLE_ICONS[r.id]}
            selected={r.id === role.id}
            onChange={() => {
              setSwapped(true);
              onSelect(r.id);
            }}
            className="career-role"
            aria-controls="career-fit-panel"
            data-hub="career-role"
            data-role-id={r.id}
          >
            {r.label}
          </Chip>
        ))}
      </div>

      <div className="career-fit-wrap">
        <Panel
          as="section"
          radius="feature"
          padding="none"
          className="career-fit"
          id="career-fit-panel"
          aria-labelledby="career-fit-title"
          data-hub="career-fit"
          data-role-id={role.id}
        >
          <div className="career-fit__summary">
            <p className="career-fit__kicker">
              <span className="career-fit__dot" style={{ background: cohortColor(year) }} aria-hidden="true" />
              Role fit for {cohort}
            </p>
            <h2 id="career-fit-title" className="career-fit__role">
              {Icon ? <Icon className="career-fit__role-icon" weight="duotone" aria-hidden="true" /> : null}
              {role.title}
            </h2>

            <div className="career-score" aria-live="polite">
              <ProgressRing
                value={fit.total ? (n / fit.total) * 100 : 0}
                size={128}
                stroke={11}
                color={cohortColor(year)}
                label={`${n} of ${fit.total} skills covered by ${cohort}`}
              >
                <span className="career-score__num" aria-hidden="true">
                  {n}
                  <small>/{fit.total}</small>
                </span>
              </ProgressRing>
              <div className="career-score__text">
                <p className="career-score__headline">
                  <strong>
                    {n} of {fit.total}
                  </strong>{' '}
                  skills covered by {cohort}
                </p>
                <p className="career-score__sub">
                  {subline(fit).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </p>
              </div>
            </div>

            <p className="career-fit__about">{role.about}</p>

            <div className="career-tools">
              <p className="career-tools__label">Typical tools</p>
              <ul role="list" className="career-tools__list">
                {role.tools.map((t) => (
                  <li key={t}>
                    <Badge tone="outline">{t}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            {fitCerts.length ? (
              <div className="career-fitcerts">
                <p className="career-tools__label">Certificates that fit</p>
                <ul role="list" className="career-fitcerts__list">
                  {fitCerts.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="career-fitcert" onClick={() => jumpTo(`career-cert-${c.id}`, { flash: true, block: 'center' })}>
                        <span className="career-fitcert__name">{c.short}</span>
                        <span className="career-fitcert__issuer">{c.issuer}</span>
                        <ArrowRight className="career-fitcert__go" weight="bold" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Button variant="secondary" size="sm" leadingIcon={ChatsCircle} to={askLink(role.ask)} className="career-fit__ask">
              Ask seniors about this role
            </Button>
          </div>

          <div className="career-fit__skills">
            <div className="career-skills__head">
              <h3 className="career-skills__title">Skills this role asks for</h3>
              <ul role="list" className="career-legend" aria-label="How to read the bars">
                <li>
                  <span className="career-legend__swatch is-solid" aria-hidden="true" />
                  Taught so far
                </li>
                <li>
                  <span className="career-legend__swatch is-ghost" aria-hidden="true" />
                  Taught later
                </li>
                <li>
                  <span className="career-legend__swatch" aria-hidden="true" />
                  Not taught
                </li>
              </ul>
            </div>

            <div className={cx('career-skills__body', swapped && 'is-swapped')} key={role.id}>
              {GROUPS.map((g) => {
                const rows = fit[g.status === 'covered' ? 'covered' : g.status === 'later' ? 'later' : 'gaps'];
                if (!rows.length) return null;
                return (
                  <section key={g.status} className={cx('career-group', `is-${g.status}`)} aria-label={g.title}>
                    <div className="career-group__head">
                      <span className="career-group__mark" aria-hidden="true" />
                      <h4 className="career-group__title">{g.title}</h4>
                      <Badge size="sm">{rows.length}</Badge>
                    </div>
                    <ul role="list" className="career-group__list">
                      {rows.map((row) => (
                        <SkillRow key={row.id} row={row} roleId={role.id} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </Panel>
        <p className="career-skills__note">
          A guide built from each module’s description and lessons, not an official syllabus. Modules marked option or elective count if you choose
          them.
        </p>
      </div>
    </PageSection>
  );
}
