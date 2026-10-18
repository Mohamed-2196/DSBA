// A module's past papers (the Files tab, #papers): a grid of sittings, newest first. Each sitting shows a card per
// zone's paper with its real first page, and the ways in: Open, the examiners' report, solutions and Time me.
// Papers without an exam year follow as "Other papers".
import { Exam, Timer } from '@phosphor-icons/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryItem, Sitting, SittingZone } from '../../../api/types';
import { RTC_NOTE, sittingLabel, zoneLabel, type Zone } from '../../../lib/exams';
import { Badge, Button, Panel, SegmentedControl, Skeleton } from '../../../ui';
import { PaperDone, SittingsDone } from '../../board/public';
import { usePapers } from '../../papers/public';
import { itemPath } from '../api';
import { kindLabel } from '../kinds';
import { sittingCards, sittingFiles, usePaperSittings, zonesIn, type PaperCard } from '../papers';
import type { LinkState } from './FileCard';
import { FileThumb } from './FileThumb';
import './PaperSittings.css';

const FIRST = 4;
type ZoneFilter = Zone | 'all';

/** "?time=1" on a paper's address opens Time me as the paper opens. */
const timeMeHref = (item: LibraryItem) => `${itemPath(item)}?time=1`;

function PaperCardView({
  card,
  yours,
  linkState,
  board,
}: {
  card: PaperCard;
  yours: boolean;
  linkState: LinkState;
  board: boolean;
}) {
  const { item, zone, reports, solutions } = card;
  const isPaper = item.kind === 'past-paper';
  const name = isPaper ? (zone ? zoneLabel(zone) : 'All zones') : kindLabel(item.kind);
  return (
    <li className="pp-card" data-hub="paper-card">
      <Link
        to={itemPath(item)}
        state={linkState}
        className="pp-card__cover"
        aria-label={`Open ${item.title}`}
        title={item.title}
      >
        <FileThumb item={item} size="strip" />
      </Link>
      <div className="pp-card__body">
        <p className="pp-card__name">
          <span>{name}</span>
          {yours ? (
            <Badge tone="highlight" size="sm">
              Your zone
            </Badge>
          ) : null}
          {board && isPaper ? <PaperDone itemId={item.id} /> : null}
        </p>
        <Button size="sm" variant="primary" to={itemPath(item)} fullWidth className="pp-card__open">
          Open
        </Button>
        {isPaper ? (
          <ul role="list" className="pp-card__more">
            {reports.map((r, i) => (
              <li key={r.id}>
                <Link to={itemPath(r)} state={linkState} className="pp-card__link" title={r.title}>
                  {reports.length > 1 ? `Report ${i + 1}` : 'Report'}
                </Link>
              </li>
            ))}
            {solutions.map((f, i) => (
              <li key={f.id}>
                <Link to={itemPath(f)} state={linkState} className="pp-card__link" title={f.title}>
                  {solutions.length > 1 ? `Solutions ${i + 1}` : 'Solutions'}
                </Link>
              </li>
            ))}
            <li>
              <Link
                to={timeMeHref(item)}
                state={linkState}
                className="pp-card__link"
                aria-label={`Time me on ${item.title}`}
              >
                <Timer aria-hidden="true" weight="bold" />
                Time me
              </Link>
            </li>
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function SittingBlock({
  sitting,
  zone,
  only,
  linkState,
  board,
}: {
  sitting: Sitting;
  zone: SittingZone['zone'];
  only: SittingZone['zone'];
  linkState: LinkState;
  board: boolean;
}) {
  const cards = sittingCards(sitting, zone, only);
  if (!cards.length) return null;
  const hasPaper = sitting.zones.some((z) => z.papers.length);
  const hasReport = sitting.zones.some((z) => z.reports.length);
  const label = sittingLabel(sitting.examYear, sitting.session);
  return (
    <li className="pp-sitting" aria-label={label}>
      <h4 className="pp-sitting__when">
        <span className="u-tabular">{label}</span>
        {sitting.session === 'october' ? <span className="pp-sitting__kind">Resit sitting</span> : null}
        {hasPaper && !hasReport ? <span className="pp-sitting__none">No examiners’ report yet</span> : null}
        {!hasPaper ? <span className="pp-sitting__none">Paper not in the Hub yet</span> : null}
      </h4>
      <ul role="list" className="pp-grid">
        {cards.map((c) => (
          <PaperCardView key={c.key} card={c} yours={!!zone && c.zone === zone} linkState={linkState} board={board} />
        ))}
      </ul>
    </li>
  );
}

/** The Files tab's past papers. Renders nothing while the module has none. `board`: the study board is on, so the
 *  heading says how many sittings are done. */
export function PaperSittings({
  moduleId,
  linkState,
  renderOther,
  board,
}: {
  moduleId: string;
  linkState: LinkState;
  renderOther: (items: LibraryItem[]) => ReactNode;
  board: boolean;
}) {
  const papers = usePaperSittings(moduleId);
  const { zone } = usePapers();
  const [all, setAll] = useState(false);
  const zones = useMemo(() => zonesIn(papers.data?.sittings ?? []), [papers.data]);
  const [picked, setPicked] = useState<ZoneFilter | null>(null);
  // Your zone's papers by default, once the module has them; every zone otherwise.
  const filter: ZoneFilter = picked ?? (zone && zones.includes(zone) ? zone : 'all');
  if (papers.isPending) {
    return (
      <section className="lib-mf__group" aria-busy="true" aria-label="Past papers">
        <Skeleton width={180} height={20} />
        <Skeleton height={220} radius={16} />
      </section>
    );
  }
  if (papers.isError) return null; // the files below still list every paper
  const { sittings, other } = papers.data;
  if (!sittings.length && !other.length) return null;
  const only = filter === 'all' ? null : filter;
  const shown = sittings.filter((s) => sittingCards(s, zone, only).length);
  const visible = all ? shown : shown.slice(0, FIRST);
  return (
    <>
      {sittings.length ? (
        <section id="papers" className="lib-mf__group pp" aria-labelledby="lib-mf-sittings" data-hub="paper-sittings">
          <div className="pp__head">
            <h3 id="lib-mf-sittings" className="lib-mf__h">
              <Exam aria-hidden="true" weight="duotone" className="pp__icon" />
              Past papers
              <span className="lib-mf__count">
                {sittings.length} {sittings.length === 1 ? 'sitting' : 'sittings'}
              </span>
              {board ? (
                <SittingsDone
                  papers={sittings.flatMap((s) => sittingFiles(s).filter((f) => f.kind === 'past-paper'))}
                  className="lib-mf__sittings"
                />
              ) : null}
            </h3>
            {zones.length > 1 ? (
              <SegmentedControl<ZoneFilter>
                label="Zone"
                size="sm"
                value={filter}
                onChange={(z) => {
                  setPicked(z);
                  setAll(false);
                }}
                options={[
                  { value: 'all', label: 'All zones' },
                  ...zones.map((z) => ({ value: z, label: zoneLabel(z) })),
                ]}
              />
            ) : null}
          </div>
          <p className="pp__intro">
            Newest first. Open a paper, check it against the examiners’ report, or sit it against the clock with Time
            me.
          </p>
          <Panel as="div" padding="none" className="pp__panel">
            <ul role="list" className="pp__sittings">
              {visible.map((s) => (
                <SittingBlock
                  key={`${s.examYear}-${s.session ?? 'any'}`}
                  sitting={s}
                  zone={zone}
                  only={only}
                  linkState={linkState}
                  board={board}
                />
              ))}
            </ul>
          </Panel>
          {zones.includes('RTC') ? <p className="pp__note">{RTC_NOTE}</p> : null}
          {shown.length > FIRST ? (
            <div className="pp__more">
              <Button size="sm" variant="ghost" onClick={() => setAll((a) => !a)} aria-expanded={all}>
                {all ? 'Show fewer sittings' : `Show all ${shown.length} sittings`}
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
          <p className="pp__intro">Mocks, sample papers and papers whose sitting isn’t known.</p>
          {renderOther(other)}
        </section>
      ) : null}
    </>
  );
}
