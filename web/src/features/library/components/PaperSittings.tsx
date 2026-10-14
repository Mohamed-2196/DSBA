// A module's past papers by sitting (the Files tab): each year and session, newest first, with each zone's paper,
// its examiners' report and its solutions side by side. Papers without an exam year follow as "Other papers".
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryItem, Sitting, SittingZone } from '../../../api/types';
import { Button, Panel, Skeleton } from '../../../ui';
import { itemPath } from '../api';
import { sittingLabel } from '../display';
import { usePaperSittings } from '../papers';
import type { LinkState } from './FileCard';
import './PaperSittings.css';

const FIRST = 6;

function FileLink({ item, label, linkState }: { item: LibraryItem; label: string; linkState: LinkState }) {
  return (
    <li>
      <Link to={itemPath(item)} state={linkState} className="lib-sit__file" title={item.title} aria-label={`${label}: ${item.title}`}>
        {label}
      </Link>
    </li>
  );
}

function numbered(items: LibraryItem[], label: string): { item: LibraryItem; label: string }[] {
  return items.map((item, i) => ({ item, label: items.length > 1 ? `${label} ${i + 1}` : label }));
}

function ZoneFiles({ zone, many, linkState }: { zone: SittingZone; many: boolean; linkState: LinkState }) {
  const files = [...numbered(zone.papers, 'Paper'), ...numbered(zone.reports, 'Examiners’ report'), ...numbered(zone.solutions, 'Solutions')];
  return (
    <div className="lib-sit__zone">
      {many || zone.zone ? <span className="lib-sit__zone-name">{zone.zone ? `Zone ${zone.zone}` : 'Both zones'}</span> : null}
      <ul role="list" className="lib-sit__files">
        {files.map((f) => (
          <FileLink key={f.item.id} item={f.item} label={f.label} linkState={linkState} />
        ))}
      </ul>
    </div>
  );
}

function SittingRow({ sitting, linkState }: { sitting: Sitting; linkState: LinkState }) {
  const many = sitting.zones.length > 1;
  const hasPaper = sitting.zones.some((z) => z.papers.length);
  const hasReport = sitting.zones.some((z) => z.reports.length);
  return (
    <li className="lib-sit">
      <h4 className="lib-sit__when u-tabular">{sittingLabel(sitting.examYear, sitting.session)}</h4>
      <div className="lib-sit__zones">
        {sitting.zones.map((z) => (
          <ZoneFiles key={z.zone ?? 'both'} zone={z} many={many} linkState={linkState} />
        ))}
        {hasPaper && !hasReport ? <p className="lib-sit__none">No examiners’ report yet</p> : null}
      </div>
    </li>
  );
}

/** The Files tab's past papers. Renders nothing while the module has none. */
export function PaperSittings({ moduleId, linkState, renderOther }: { moduleId: string; linkState: LinkState; renderOther: (items: LibraryItem[]) => ReactNode }) {
  const papers = usePaperSittings(moduleId);
  const [all, setAll] = useState(false);
  if (papers.isPending) {
    return (
      <section className="lib-mf__group" aria-busy="true" aria-label="Past papers">
        <Skeleton width={180} height={20} />
        <Skeleton height={120} radius={16} />
      </section>
    );
  }
  if (papers.isError) return null; // the files below still list every paper
  const { sittings, other } = papers.data;
  if (!sittings.length && !other.length) return null;
  const shown = all ? sittings : sittings.slice(0, FIRST);
  return (
    <>
      {sittings.length ? (
        <section className="lib-mf__group" aria-labelledby="lib-mf-sittings" data-hub="paper-sittings">
          <h3 id="lib-mf-sittings" className="lib-mf__h">
            Past papers by sitting
            <span className="lib-mf__count">{sittings.length}</span>
          </h3>
          <Panel as="div" padding="none" className="lib-mf__panel">
            <ul role="list" className="lib-sit__list">
              {shown.map((s) => (
                <SittingRow key={`${s.examYear}-${s.session ?? 'any'}`} sitting={s} linkState={linkState} />
              ))}
            </ul>
          </Panel>
          {sittings.length > FIRST ? (
            <div className="lib-sit__more">
              <Button size="sm" variant="ghost" onClick={() => setAll((a) => !a)} aria-expanded={all}>
                {all ? 'Show fewer sittings' : `Show all ${sittings.length} sittings`}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {other.length ? (
        <section className="lib-mf__group" aria-labelledby="lib-mf-other-papers">
          <h3 id="lib-mf-other-papers" className="lib-mf__h">
            Other papers
            <span className="lib-mf__count">{other.length}</span>
          </h3>
          {renderOther(other)}
        </section>
      ) : null}
    </>
  );
}
