// /results-day: what results mean and what to do next (the Results day guide, edited in Manage → Guides). Open to
// everyone, all year.
import type { ResultsDay } from '../../api/types';
import { useAuth } from '../../auth';
import {
  Badge,
  glyph,
  Icon,
  Page,
  PageHeader,
  PageSection,
  Panel,
  QueryError,
  SectionHeader,
  Skeleton,
} from '../../ui';
import { ProjectedClass } from '../grades/public';
import { httpsHref, useSite } from '../site/public';
import { useGuides } from './api';
import { GuideSteps } from './GuideSteps';
import { useResultsTicks } from './useGuideTicks';
import './StartHere.css';

/** The University's own pages: Site settings' regulations and results links. */
function Sources() {
  const site = useSite().data;
  if (!site) return null;
  const links = [site.links.regulations, site.links.results];
  return (
    <ul role="list" className="start-sources">
      {links.map((l) => {
        const href = httpsHref(l.url);
        return href ? (
          <li key={l.label}>
            <a href={href} target="_blank" rel="noopener noreferrer" className="start-link">
              {l.label}
              <Icon glyph={glyph.external} />
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </li>
        ) : null;
      })}
    </ul>
  );
}

/** The guide's page, from the guide as it is (or as an editor's draft, in the editor's preview). */
export function ResultsDayBody({ guide }: { guide: ResultsDay }) {
  const { featureOn } = useAuth();
  const ticks = useResultsTicks(guide.steps);
  const n = ticks.done.size;
  return (
    <>
      <PageHeader
        section="tools"
        title={guide.title}
        description={guide.intro}
        meta={
          <Badge
            tone={n === ticks.total ? 'signal' : 'neutral'}
            aria-live="polite"
          >{`${n} of ${ticks.total} done`}</Badge>
        }
      />
      <PageSection aria-labelledby="results-steps-title">
        <SectionHeader id="results-steps-title" title="What to do next" />
        <Panel as="div" padding="none" radius="feature" className="start-page__panel">
          <GuideSteps steps={guide.steps} ticks={ticks} variant="page" />
        </Panel>
      </PageSection>
      {featureOn('grades') ? (
        <PageSection aria-labelledby="results-marks-title">
          <SectionHeader
            id="results-marks-title"
            title="Your marks in the calculator"
            description="Read from this browser. Nothing is sent anywhere."
          />
          <Panel as="div" padding="none" radius="feature" className="start-page__panel start-page__panel--roomy">
            <ProjectedClass />
          </Panel>
        </PageSection>
      ) : null}
      <PageSection aria-labelledby="results-rules-title">
        <SectionHeader id="results-rules-title" title="The official rules" description={guide.sourcesIntro} />
        <Sources />
      </PageSection>
    </>
  );
}

export default function ResultsDayPage() {
  const guides = useGuides();
  return (
    <Page className="start-page">
      {guides.data ? (
        <ResultsDayBody guide={guides.data.resultsDay} />
      ) : guides.isError ? (
        <QueryError
          error={guides.error}
          title="Results day didn’t load"
          onRetry={() => void guides.refetch()}
          retrying={guides.isFetching}
        />
      ) : (
        <Skeleton lines={10} />
      )}
    </Page>
  );
}
