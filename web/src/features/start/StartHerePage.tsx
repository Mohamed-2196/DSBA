// /start-here: Year 1's first weeks in full (data/guides.ts). Open to everyone, all year.
import { ArrowSquareOut } from '@phosphor-icons/react';
import { START_HERE } from '../../data/guides';
import { Badge, Page, PageHeader, PageSection, Panel, SectionHeader } from '../../ui';
import { safeHref } from '../../ui/safeHref';
import { StartHereSteps } from './StartHereSteps';
import { useStartTicks } from './useStartTicks';
import './StartHere.css';

function Places() {
  return (
    <ul role="list" className="start-places">
      {START_HERE.places.map((p) => {
        const safe = safeHref(p.href);
        const href = safe?.kind === 'external' && safe.href.startsWith('https:') ? safe.href : null;
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

export default function StartHerePage() {
  const { done, total } = useStartTicks();
  const n = done.size;
  return (
    <Page className="start-page">
      <PageHeader title={START_HERE.title} description={START_HERE.intro} meta={<Badge tone={n === total ? 'signal' : 'neutral'} aria-live="polite">{`${n} of ${total} done`}</Badge>} />
      <PageSection aria-labelledby="start-steps-title">
        <SectionHeader id="start-steps-title" title="Your first weeks" />
        <Panel as="div" padding="none" radius="feature" className="start-page__panel">
          <StartHereSteps variant="page" />
        </Panel>
        {n === total ? <p className="start-page__done">All done. Welcome to DSBA.</p> : null}
      </PageSection>
      <PageSection aria-labelledby="start-places-title">
        <SectionHeader id="start-places-title" title="MyClass, the VLE and the portal" description="Three sites with similar jobs, told apart." />
        <Places />
      </PageSection>
    </Page>
  );
}
