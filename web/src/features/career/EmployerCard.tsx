// One employer in the results: its logo tile, its name and programmes, a line of what it offers, its sector and the
// tracks it suits, why it is listed, its next application date, and one button to its own careers or programme page.
import { Link } from 'react-router-dom';
import type { CareerEmployer, CareerTrack } from '../../api/types';
import { Button, glyph, Icon, cx } from '../../ui';
import { hostOf } from '../../lib/share';
import { useCareerData } from './context';
import { offerTypesOf, programmeLine } from './lib/board';
import { webUrl } from './lib/links';
import { LogoSlot } from './LogoSlot';
import type { ApplicationDate } from './useApplicationDates';

export function EmployerCard({
  employer,
  picked,
  tracks,
  application,
}: {
  employer: CareerEmployer;
  /** the tracks the student filtered by, marked on the row */
  picked: readonly string[];
  tracks: ReadonlyMap<string, CareerTrack>;
  application: ApplicationDate | undefined;
}) {
  const { offerTypes: labels, ctaLabel } = useCareerData();
  const types = offerTypesOf(employer);
  const programme = programmeLine(employer);
  const url = webUrl(employer.url);
  const host = hostOf(url);
  return (
    <li
      id={`career-emp-${employer.id}`}
      className="career-emp"
      data-hub="career-employer"
      data-employer-id={employer.id}
      data-offer-types={types.join(' ')}
    >
      <LogoSlot kind="employer" id={employer.id} logo={employer.logo} mono={employer.mono} />

      <div className="career-emp__main">
        <h3 className="career-emp__name">{employer.name}</h3>
        {programme ? <p className="career-emp__programme">{programme}</p> : null}
        <p className="career-emp__meta">
          <span>{types.map((t) => labels[t].label).join(', ')}</span>
          <span>{employer.sector}</span>
          {employer.tracks.length ? (
            <span>
              {employer.tracks.map((id, i) => (
                <span key={id} className={cx('career-emp__track', picked.includes(id) && 'is-active')}>
                  {i ? ', ' : ''}
                  {tracks.get(id)?.short ?? id}
                </span>
              ))}
            </span>
          ) : null}
        </p>
        <p className="career-emp__why">{employer.why}</p>
        {application ? (
          <p className="career-emp__dates" data-hub="career-application-date">
            <Icon glyph={glyph.calendar} className="career-emp__dates-icon" />
            <Link to={`/calendar?event=${encodeURIComponent(application.event.id)}`}>{application.line}</Link>
            <span className="career-emp__dates-title">{application.event.title}</span>
          </p>
        ) : null}
      </div>

      {url ? (
        <Button
          variant="secondary"
          size="sm"
          href={url}
          trailingIcon={<Icon glyph={glyph.external} />}
          className="career-emp__cta"
          data-hub="career-apply"
        >
          {ctaLabel[employer.cta]}
          <span className="visually-hidden">{` at ${employer.name}, opens ${host} in a new tab`}</span>
        </Button>
      ) : null}
    </li>
  );
}
