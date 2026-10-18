// The one competition on the board, beside the page title.
import { ArrowUpRight } from '@phosphor-icons/react';
import { Badge } from '../../ui';
import { hostOf } from '../../lib/share';
import { useCareerData } from './context';
import { webUrl } from './lib/links';
import { logoOf } from './lib/logos';
import { LogoSlot } from './LogoSlot';

/**
 * The one competition on the board, featured beside the page title. BIBF is taking participants, so the way in
 * is the programme office (no deadline is shown, and none is invented).
 */
export function FeaturedCompetition() {
  const doc = useCareerData();
  const f = doc.featured;
  if (!f) return null;
  const url = webUrl(f.url);
  return (
    <aside
      id={`career-opp-${f.id}`}
      className="career-featured"
      aria-labelledby="career-featured-title"
      data-hub="career-featured"
      data-opp-id={f.id}
    >
      <LogoSlot kind={f.logo.kind} id={f.logo.id} logo={logoOf(doc, f.logo.kind, f.logo.id)} mono={f.mono} size="sm" />
      <div className="career-featured__text">
        <div className="career-featured__head">
          <h2 id="career-featured-title" className="career-featured__title">
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="career-featured__link">
                {f.title}
                <ArrowUpRight className="career-featured__go" weight="bold" aria-hidden="true" />
                <span className="visually-hidden">{`, opens ${hostOf(url)} in a new tab`}</span>
              </a>
            ) : (
              f.title
            )}
          </h2>
          {f.badge ? <Badge tone="signal">{f.badge}</Badge> : null}
        </div>
        <p className="career-featured__blurb">
          {f.kind ? <span className="career-featured__kind">{f.kind}.</span> : null} {f.blurb}{' '}
          {f.note ? <strong>{f.note}</strong> : null}
        </p>
      </div>
    </aside>
  );
}
