import { Link } from 'react-router-dom';
import { Badge, CohortBadge, cx } from '../../../../ui';
import { useYear } from '../../../../state';
import { getModule } from '../../../../data/modules.js';
import { RichText } from '../RichText.jsx';

/** Cohort corner: one update per year. Unit codes are set big (Year 3 has none: names instead). */
export function CohortCorner({ section }) {
  const { year } = useYear();
  return (
    <div className="nl-cohorts">
      {section.cohorts.map((c) => {
        const modules = c.moduleIds.map(getModule).filter(Boolean);
        const hasCodes = modules.every((m) => m.unitCode);
        const id = `nl-cohort-${section.id}-${c.year}`;
        return (
          <article key={c.year} className={cx('nl-cohort', `nl-cohort--y${c.year}`)} aria-labelledby={id}>
            <div className="nl-cohort__head">
              <CohortBadge year={c.year} variant="solid" />
              {year === c.year ? <Badge tone="highlight">Your year</Badge> : null}
            </div>
            <h3 id={id} className="nl-cohort__title">
              {c.title}
            </h3>
            <ul role="list" className={cx('nl-cohort__modules', hasCodes ? 'has-codes' : 'has-names')}>
              {modules.map((m) => (
                <li key={m.id}>
                  <Link to={`/modules/${m.id}`} className={hasCodes ? 'nl-cohort__code' : 'nl-cohort__name'} title={m.name}>
                    {hasCodes ? m.unitCode : m.name}
                  </Link>
                </li>
              ))}
            </ul>
            {c.paragraphs.map((p) => (
              <p key={p} className="nl-p">
                <RichText text={p} />
              </p>
            ))}
          </article>
        );
      })}
    </div>
  );
}
