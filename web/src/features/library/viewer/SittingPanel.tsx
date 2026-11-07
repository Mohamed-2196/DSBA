// The paper page's "This sitting": the examiners' report and solutions for the paper, and the other zones' papers (zone A,
// zone B, RTC). On a past paper, a separate "Other sittings" block follows with the previous and next sittings' papers.
import { Link } from 'react-router-dom';
import type { LibraryItem } from '../../../api/types';
import { itemPath } from '../api';
import type { LinkState } from '../types';
import { sittingLabel, zoneLabel } from '../../../lib/exams';
import { WORKED_LABEL, nearbyPapers, paperContext, usePaperSittings } from '../papers';

export function SittingPanel({ item, linkState }: { item: LibraryItem; linkState?: LinkState }) {
  const papers = usePaperSittings(item.moduleId, { enabled: item.examYear !== null && item.source === 'file' });
  const ctx = paperContext(papers.data?.sittings, item.id);
  if (!ctx) return null;
  const nearby = item.kind === 'past-paper' ? nearbyPapers(papers.data?.sittings, item) : null;
  const around = nearby
    ? [
        { item: nearby.previous, label: 'Previous exam' },
        { item: nearby.next, label: 'Next exam' },
      ].flatMap((l) => (l.item ? [{ item: l.item, label: l.label }] : []))
    : [];
  const when = (f: LibraryItem) =>
    `${f.examYear ? sittingLabel(f.examYear, f.examSession) : ''}${f.zone && f.zone !== item.zone ? `, ${zoneLabel(f.zone)}` : ''}`;
  const links: { item: LibraryItem; label: string }[] = [
    ...ctx.reports.map((f) => ({
      item: f,
      label:
        // no solutions, but this report works through the questions: say so
        f.workedAnswers && !ctx.solutions.length
          ? WORKED_LABEL
          : f.zone && f.zone !== item.zone
            ? `Examiners’ report, ${zoneLabel(f.zone)}`
            : 'Examiners’ report',
    })),
    ...ctx.solutions.map((f) => ({ item: f, label: 'Solutions' })),
    ...(item.kind === 'past-paper' ? [] : ctx.zone.papers.map((f) => ({ item: f, label: 'The paper' }))),
    ...ctx.otherPapers.map(({ zone, item: f }) => ({
      item: f,
      label: zone ? `${zoneLabel(zone)} paper` : 'Paper for all zones',
    })),
  ];
  return (
    <>
      <section className="lib-meta__sitting" aria-labelledby="lib-meta-sitting" data-hub="file-sitting">
        <h2 id="lib-meta-sitting" className="lib-meta__h">
          {sittingLabel(ctx.sitting.examYear, ctx.sitting.session)} sitting
        </h2>
        {links.length ? (
          <ul role="list" className="lib-meta__sitting-list">
            {links.map((l) => (
              <li key={l.item.id}>
                <Link to={itemPath(l.item)} state={linkState} className="lib-meta__sitting-link" title={l.item.title}>
                  <span>{l.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="lib-meta__sitting-none">No examiners’ report for this sitting yet.</p>
        )}
      </section>
      {around.length ? (
        // its own block, under its own heading: these papers are from other sittings, not this one
        <section className="lib-meta__sitting" aria-labelledby="lib-meta-nearby" data-hub="file-nearby-papers">
          <h2 id="lib-meta-nearby" className="lib-meta__h">
            Other sittings
          </h2>
          <ul role="list" className="lib-meta__sitting-list">
            {around.map((l) => (
              <li key={l.label}>
                <Link to={itemPath(l.item)} state={linkState} className="lib-meta__sitting-link" title={l.item.title}>
                  <span>{l.label}</span>
                  <span>{when(l.item)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
