// /results-day: what results mean and what to do next (data/guides.ts). Open to everyone, all year.
import { ArrowSquareOut } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { RESULTS_DAY, UOL_RULES } from '../../data/guides';
import { Badge, Page, PageHeader, PageSection, Panel, SectionHeader } from '../../ui';
import { ProjectedClass } from '../grades/public';
import { GuideSteps } from './GuideSteps';
import { useResultsTicks } from './useGuideTicks';
import './StartHere.css';

const SOURCES = [UOL_RULES.regulations, UOL_RULES.results];

export default function ResultsDayPage() {
  const { featureOn } = useAuth();
  const ticks = useResultsTicks();
  const n = ticks.done.size;
  return (
    <Page className="start-page">
      <PageHeader
        title={RESULTS_DAY.title}
        description={RESULTS_DAY.intro}
        meta={<Badge tone={n === ticks.total ? 'signal' : 'neutral'} aria-live="polite">{`${n} of ${ticks.total} done`}</Badge>}
      />
      <PageSection aria-labelledby="results-steps-title">
        <SectionHeader id="results-steps-title" title="What to do next" />
        <Panel as="div" padding="none" radius="feature" className="start-page__panel">
          <GuideSteps steps={RESULTS_DAY.steps} ticks={ticks} variant="page" />
        </Panel>
      </PageSection>
      {featureOn('grades') ? (
        <PageSection aria-labelledby="results-marks-title">
          <SectionHeader id="results-marks-title" title="Your marks in the calculator" description="Read from this browser. Nothing is sent anywhere." />
          <Panel as="div" padding="none" radius="feature" className="start-page__panel start-page__panel--roomy">
            <ProjectedClass />
          </Panel>
        </PageSection>
      ) : null}
      <PageSection aria-labelledby="results-rules-title">
        <SectionHeader id="results-rules-title" title="The official rules" description="A guide written by students. The University’s own pages decide." />
        <ul role="list" className="start-sources">
          {SOURCES.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="start-link">
                {s.label}
                <ArrowSquareOut weight="bold" aria-hidden="true" />
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </PageSection>
    </Page>
  );
}
