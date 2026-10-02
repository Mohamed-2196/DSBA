import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  Certificate,
  ChartBar,
  ChartPieSlice,
  ChatsCircle,
  CheckCircle,
  CircleDashed,
  Cpu,
  FileText,
  Flask,
  Handshake,
  PlayCircle,
  ShieldWarning,
  Target,
  Trophy,
  TrendUp,
  Wrench,
} from '@phosphor-icons/react';
import { cohortColor, cohortLabel } from '../../state';
import { Badge, Button, Chip, CohortBadge, PageSection, Panel, ProgressRing, SectionHeader, cx } from '../../ui';
import { YEAR_HINTS } from './data/afterDsba.js';
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
  { status: 'covered', key: 'covered', title: 'Covered by your modules so far', icon: CheckCircle, weight: 'fill' },
  { status: 'later', key: 'later', title: 'Coming in later years', icon: CircleDashed, weight: 'bold' },
  { status: 'gap', key: 'gaps', title: 'Yours to close', icon: Wrench, weight: 'bold' },
];

const CLOSE_ICONS = { lesson: PlayCircle, file: FileText, cert: Certificate, forum: ChatsCircle, opps: Trophy };

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
  // A certificate card, or the CFA Research Challenge beside the page title (the board when it is not on screen).
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

/** One skill: its name and the module that teaches it, or (for a gap) why it is a gap and what to do about it. */
function Skill({ row, roleId }) {
  const close = row.status === 'gap' ? resolveClose(row.id, roleId) : null;
  return (
    <li className={cx('career-skill', `is-${row.status}`)} data-hub="career-skill" data-skill-id={row.id} data-skill-status={row.status}>
      <p className="career-skill__name">{row.skill.name}</p>
      {row.status === 'gap' ? (
        <>
          <p className="career-skill__detail">{row.detail}</p>
          {close ? <CloseAction close={close} /> : null}
        </>
      ) : (
        <div className="career-skill__mods">
          {row.named.slice(0, 1).map((n) => (
            <ModuleLink key={n.module} module={n.mod} />
          ))}
          {row.status === 'later' ? <span className="career-skill__when">{row.label}</span> : null}
        </div>
      )}
    </li>
  );
}

/** What is left after the covered skills, as one short sentence. */
function subline(fit) {
  const parts = [];
  if (fit.later.length) {
    const years = new Set(fit.later.map((r) => r.from));
    const when = years.size === 1 ? `Year ${[...years][0]}` : 'later years';
    parts.push(`${fit.later.length} more in ${when}`);
  }
  if (fit.gaps.length) parts.push(`${fit.gaps.length} to close on your own`);
  return parts.length ? `${parts.join(', ')}.` : 'Every skill is covered by your modules.';
}

/**
 * Pick a role, see which of its skills the student's modules already cover (counting modules up to `year`),
 * which arrive later and which are theirs to close. The picked role lives in the URL (?role=risk-analyst).
 */
export function RoleFit({ role, onSelect, year }) {
  const fit = useMemo(() => evaluateRole(role, year), [role, year]);
  // The skills ease in only when the student picks another role, never on arrival.
  const [swapped, setSwapped] = useState(false);
  const n = fit.covered.length;
  const cohort = cohortLabel(year);
  const Icon = ROLE_ICONS[role.id];
  const fitCerts = useMemo(() => CERTS.filter((c) => c.roles.includes(role.id)), [role]);

  return (
    <PageSection className="career-fit-section" id="career-role-fit" aria-labelledby="career-fit-heading" data-hub="career-fit" data-role-id={role.id}>
      <SectionHeader
        id="career-fit-heading"
        title="Build the skills"
        description="Pick a role to see which of its skills your modules already cover, and what is left to you."
      />

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
          data-hub="career-fit-panel"
          data-role-id={role.id}
        >
          <div className="career-fit__summary">
            <div className="career-score" aria-live="polite">
              <ProgressRing
                value={fit.total ? (n / fit.total) * 100 : 0}
                size={92}
                stroke={9}
                color={cohortColor(year)}
                label={`${n} of ${fit.total} skills covered by ${cohort}`}
              >
                <span className="career-score__num" aria-hidden="true">
                  {n}
                  <small>/{fit.total}</small>
                </span>
              </ProgressRing>
              <div className="career-score__text">
                <h3 id="career-fit-title" className="career-fit__role">
                  {Icon ? <Icon className="career-fit__role-icon" weight="duotone" aria-hidden="true" /> : null}
                  {role.title}
                </h3>
                <p className="career-score__headline">
                  <strong>
                    {n} of {fit.total}
                  </strong>{' '}
                  skills covered by {cohort}
                </p>
                <p className="career-score__sub">{subline(fit)}</p>
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
                        <Certificate className="career-fitcert__icon" aria-hidden="true" />
                        {c.short}
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

          <div className={cx('career-fit__skills', swapped && 'is-swapped')} key={role.id}>
            {GROUPS.map((g) => {
              const rows = fit[g.key];
              if (!rows.length) return null;
              const GroupIcon = g.icon;
              return (
                <section key={g.status} className={cx('career-group', `is-${g.status}`)} aria-label={`${g.title}: ${rows.length}`}>
                  <h4 className="career-group__title">
                    <GroupIcon className="career-group__icon" weight={g.weight} aria-hidden="true" />
                    {g.title}
                    <span className="career-group__count">{rows.length}</span>
                  </h4>
                  <ul role="list" className="career-group__list">
                    {rows.map((row) => (
                      <Skill key={row.id} row={row} roleId={role.id} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </Panel>

        <div className="career-fit__note">
          <CohortBadge year={year} />
          <p className="career-note">
            {YEAR_HINTS[year]} A guide built from each module’s description and lessons, not an official syllabus. Modules marked option or elective
            count if you choose them.
          </p>
        </div>
      </div>
    </PageSection>
  );
}
