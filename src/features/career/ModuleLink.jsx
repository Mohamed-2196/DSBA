import { Link } from 'react-router-dom';
import { cohortColor } from '../../state';
import { Tooltip, cx } from '../../ui';
import { CHOSEN } from './data/skills.js';

/**
 * A module as a small link: cohort dot, unit code (Year 3 modules have none), short name and, for modules a
 * student chooses, an "option" or "elective" tag. Opens /modules/<id>.
 */
export function ModuleLink({ module: m, className }) {
  const tag = CHOSEN[m.id];
  return (
    <Tooltip label={`${m.name}, Year ${m.year}${tag ? `, ${tag}` : ''}`} side="top" describe={false}>
      <Link to={`/modules/${m.id}`} className={cx('career-mod', className)}>
        <span className="career-mod__dot" style={{ background: cohortColor(m.year) }} aria-hidden="true" />
        {m.unitCode ? <span className="career-mod__code u-code">{m.unitCode}</span> : null}
        <span className="career-mod__name">{m.shortName}</span>
        {tag ? <span className="career-mod__tag">{tag}</span> : null}
        <span className="visually-hidden">{`, ${m.name}, Year ${m.year}`}</span>
      </Link>
    </Tooltip>
  );
}
