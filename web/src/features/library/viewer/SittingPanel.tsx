// The paper page's "This sitting": the examiners' report and solutions for the paper, and the other zones' papers (zone A, zone B, RTC).
import { Link } from 'react-router-dom';
import type { LibraryItem } from '../../../api/types';
import { itemPath } from '../api';
import type { LinkState } from '../components/FileCard';
import { sittingLabel, zoneLabel } from '../../../lib/exams';
import { WORKED_LABEL, paperContext, usePaperSittings } from '../papers';

export function SittingPanel({ item, linkState }: { item: LibraryItem; linkState?: LinkState }) {
  const papers = usePaperSittings(item.moduleId, { enabled: item.examYear !== null && item.source === 'file' });
  const ctx = paperContext(papers.data?.sittings, item.id);
  if (!ctx) return null;
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
  );
}
