// /start-here: Year 1's first weeks in full (the Start here guide, edited in Manage → Guides). Open to everyone,
// all year.
import { ArrowSquareOut } from '@phosphor-icons/react';
import type { GuidePlace, StartHere } from '../../api/types';
import { Badge, Page, PageHeader, PageSection, Panel, QueryError, SectionHeader, Skeleton } from '../../ui';
import { httpsHref, useSite } from '../site/public';
import { useGuides } from './api';
import { GuideSteps } from './GuideSteps';
import { useStartTicks } from './useGuideTicks';
import './StartHere.css';

function Places({ places }: { places: readonly GuidePlace[] }) {
  const site = useSite().data;
  return (
    <ul role="list" className="start-places">
      {places.map((p) => {
        const href = p.link ? httpsHref(site?.links[p.link].url) : null;
        return (
          <li key={p.name} className="start-place">
            <p className="start-place__name">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="start-link">
                  {p.name}
                  <ArrowSquareOut weight="bold" aria-hidden="true" />
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              ) : (
                p.name
              )}
            </p>
            <p className="start-place__whose">{p.whose}</p>
            <p className="start-place__what">{p.what}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** The guide's page, from the guide as it is (or as an editor's draft, in the editor's preview). */
export function StartHereBody({ guide }: { guide: StartHere }) {
  const ticks = useStartTicks(guide.steps);
  const n = ticks.done.size;
  return (
    <>
      <PageHeader title={guide.title} description={guide.intro} meta={<Badge tone={n === ticks.total ? 'signal' : 'neutral'} aria-live="polite">{`${n} of ${ticks.total} done`}</Badge>} />
      <PageSection aria-labelledby="start-steps-title">
        <SectionHeader id="start-steps-title" title="Your first weeks" />
        <Panel as="div" padding="none" radius="feature" className="start-page__panel">
          <GuideSteps steps={guide.steps} ticks={ticks} variant="page" />
        </Panel>
        {n === ticks.total ? <p className="start-page__done">{guide.done}</p> : null}
      </PageSection>
      {guide.places.length ? (
        <PageSection aria-labelledby="start-places-title">
          <SectionHeader id="start-places-title" title={guide.placesTitle} description={guide.placesIntro} />
          <Places places={guide.places} />
        </PageSection>
      ) : null}
    </>
  );
}

export default function StartHerePage() {
  const guides = useGuides();
  return (
    <Page className="start-page">
      {guides.data ? (
        <StartHereBody guide={guides.data.startHere} />
      ) : guides.isError ? (
        <QueryError error={guides.error} title="Start here didn’t load" onRetry={() => void guides.refetch()} retrying={guides.isFetching} />
      ) : (
        <Skeleton lines={10} />
      )}
    </Page>
  );
}
