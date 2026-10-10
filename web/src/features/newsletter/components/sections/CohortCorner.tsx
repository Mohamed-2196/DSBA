import { Link } from 'react-router-dom';
import { useYear } from '../../../../state';
import { useModules } from '../../../../state/modules';
import { Badge, CohortBadge, cx } from '../../../../ui';
import type { CohortUpdate } from '../../types';
import { RichText } from '../RichText';

/** Cohort corner: one update per year. Unit codes are set big (Year 3 has none: names instead). */
export function CohortCorner({ sectionId, cohorts }: { sectionId: string; cohorts: CohortUpdate[] }) {
  const { year } = useYear();
  const { getModule } = useModules();
  return (
    <div className="nl-cohorts">
      {cohorts.map((c) => {
        const modules = c.moduleIds.map((id) => getModule(id)).filter((m): m is NonNullable<typeof m> => m !== null);
        const hasCodes = modules.every((m) => m.unitCode);
        const id = `nl-cohort-${sectionId}-${c.year}`;
        return (
          <article key={c.year} className={cx('nl-cohort', `nl-cohort--y${c.year}`)} aria-labelledby={id}>
            <div className="nl-cohort__head">
              <CohortBadge year={c.year} variant="solid" />
              {year === c.year ? <Badge tone="highlight">Your year</Badge> : null}
            </div>
            <h3 id={id} className="nl-cohort__title">
              {c.title}
            </h3>
            {modules.length ? (
              <ul role="list" className={cx('nl-cohort__modules', hasCodes ? 'has-codes' : 'has-names')}>
                {modules.map((m) => (
                  <li key={m.id}>
                    <Link to={`/modules/${m.id}`} className={hasCodes ? 'nl-cohort__code' : 'nl-cohort__name'} title={m.name}>
                      {hasCodes ? m.unitCode : m.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {c.paragraphs.map((p, i) => (
              <p key={`${i}-${p}`} className="nl-p">
                <RichText text={p} />
              </p>
            ))}
          </article>
        );
      })}
    </div>
  );
}
