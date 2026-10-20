import { useMemo, useState } from 'react';
import type { CareerRole } from '../../api/types';
import { BREAKPOINTS, cohortColor, cohortLabel, useMediaQuery, type CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import {
  Badge,
  Button,
  Chip,
  CohortBadge,
  glyph,
  Icon as BrandIcon,
  PageSection,
  Panel,
  ProgressRing,
  SectionHeader,
  cx,
  type Glyph,
} from '../../ui';
import { useStartsThreads } from '../forum/public';
import { useCareerData } from './context';
import { usePapers } from '../papers/public';
import { evaluateRole, type RoleFitResult, type SkillStatus } from './lib/fit';
import { jumpToCert } from './lib/jump';
import { askLink } from './lib/links';
import { SkillRow } from './SkillRow';
import './RoleFit.css';

const ROLE_ICONS: Record<string, Glyph> = {
  'data-analyst': glyph.chartBar,
  'data-scientist': glyph.flask,
  'business-analyst': glyph.briefcase,
  'bi-developer': glyph.chartPie,
  'risk-analyst': glyph.shieldAlert,
  'financial-analyst': glyph.trendUp,
  'ml-engineer': glyph.chip,
  'product-analyst': glyph.target,
  consultant: glyph.handshake,
};

const GROUPS: {
  status: SkillStatus;
  key: 'covered' | 'later' | 'gaps';
  title: string;
  icon: Glyph;
}[] = [
  { status: 'covered', key: 'covered', title: 'Covered by your modules so far', icon: glyph.success },
  { status: 'later', key: 'later', title: 'Coming in later years', icon: glyph.clock },
  { status: 'gap', key: 'gaps', title: 'Yours to close', icon: glyph.edit },
];

/** What is left after the covered skills, as one short sentence. */
function subline(fit: RoleFitResult): string {
  const parts: string[] = [];
  if (fit.later.length) {
    const years = new Set(fit.later.map((r) => r.from));
    const when = years.size === 1 ? `Year ${[...years][0] ?? ''}` : 'later years';
    parts.push(`${fit.later.length} more in ${when}`);
  }
  if (fit.gaps.length) parts.push(`${fit.gaps.length} to close on your own`);
  return parts.length ? `${parts.join(', ')}.` : 'Every skill is covered by your modules.';
}

export interface RoleFitProps {
  role: CareerRole;
  year: CohortYear;
  onSelect: (roleId: string) => void;
}

/**
 * Pick a role, see which of its skills the student's modules already cover (counting modules up to `year`),
 * which arrive later and which are theirs to close. The picked role lives in the URL (?role=risk-analyst).
 */
export function RoleFit({ role, onSelect, year }: RoleFitProps) {
  const data = useCareerData();
  const { getModule } = useModules();
  const startsThreads = useStartsThreads();
  const { papers } = usePapers();
  const fit = useMemo(() => evaluateRole(data, getModule, role, year, papers), [data, getModule, role, year, papers]);
  // The skills ease in only when the student picks another role, never on arrival.
  const [swapped, setSwapped] = useState(false);
  // Phones: the skills fold under the score until asked for (each role lists a dozen or more).
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const n = fit.covered.length;
  const cohort = cohortLabel(year);
  const roleGlyph = ROLE_ICONS[role.id];
  const fitCerts = useMemo(() => data.certs.filter((c) => c.roles.includes(role.id)), [data.certs, role]);

  return (
    <PageSection
      className="career-fit-section"
      id="career-role-fit"
      aria-labelledby="career-fit-heading"
      data-hub="career-fit"
      data-role-id={role.id}
    >
      <SectionHeader
        id="career-fit-heading"
        title="Build the skills"
        description="Pick a role to see which of its skills your modules already cover, and what is left to you."
      />

      <div className="career-roles" role="group" aria-label="Choose a role">
        {data.roles.map((r) => (
          <Chip
            key={r.id}
            icon={ROLE_ICONS[r.id] ?? null}
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
                  {roleGlyph ? <BrandIcon glyph={roleGlyph} className="career-fit__role-icon" /> : null}
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

            {role.tools.length ? (
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
            ) : null}

            {fitCerts.length ? (
              <div className="career-fitcerts">
                <p className="career-tools__label">Certificates that fit</p>
                <ul role="list" className="career-fitcerts__list">
                  {fitCerts.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="career-fitcert" onClick={() => jumpToCert(c.id)}>
                        <BrandIcon glyph={glyph.exam} size={16} className="career-fitcert__icon" />
                        {c.short}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {startsThreads && role.ask ? (
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<BrandIcon glyph={glyph.forum} />}
                to={askLink(role.ask)}
                className="career-fit__ask"
              >
                Ask seniors about this role
              </Button>
            ) : null}
          </div>

          {phone && !skillsOpen ? (
            <div className="career-fit__more">
              <Button
                variant="secondary"
                trailingIcon={<BrandIcon glyph={glyph.chevronDown} />}
                aria-expanded={false}
                aria-controls="career-fit-skills"
                onClick={() => setSkillsOpen(true)}
                data-hub="career-fit-show"
              >
                {`Show the ${fit.total} skills`}
              </Button>
            </div>
          ) : (
            <div className={cx('career-fit__skills', swapped && 'is-swapped')} key={role.id} id="career-fit-skills">
              {GROUPS.map((g) => {
                const rows = fit[g.key];
                if (!rows.length) return null;
                return (
                  <section
                    key={g.status}
                    className={cx('career-group', `is-${g.status}`)}
                    aria-label={`${g.title}: ${rows.length}`}
                  >
                    <h4 className="career-group__title">
                      <BrandIcon glyph={g.icon} size={20} className="career-group__icon" />
                      {g.title}
                      <span className="career-group__count">{rows.length}</span>
                    </h4>
                    <ul role="list" className="career-group__list">
                      {rows.map((row) => (
                        <SkillRow key={row.id} row={row} roleId={role.id} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="career-fit__note">
          <CohortBadge year={year} />
          <p className="career-note">
            {data.yearHints[String(year)] ?? ''} A guide built from each module’s description and lessons, not an
            official syllabus. Modules marked option or elective count if you choose them.
          </p>
        </div>
      </div>
    </PageSection>
  );
}
