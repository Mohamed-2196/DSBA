// The past papers table: one row per sitting with each zone's paper (the student's zone first and filled), the
// examiners' report, the solutions and Time me. Where the table is under 700 px wide (a phone, a card on the module's
// Overview) a row stacks: the sitting, then its links. PaperSittings shows every sitting; the module Overview the
// latest few.
import { Timer } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { LibraryItem, Sitting, SittingZone } from '../../../api/types';
import { sittingLabel } from '../../../lib/exams';
import { cx } from '../../../ui';
import { PaperDone } from '../../board/public';
import { usePapers } from '../../papers/public';
import { itemPath } from '../api';
import { sittingRow, type SittingLink } from '../papers';
import type { LinkState } from './FileCard';
import './PaperSittings.css';

/** "?time=1" on a paper's address opens Time me as the paper opens. */
const timeMeHref = (item: LibraryItem) => `${itemPath(item)}?time=1`;

function FileLink({
  link,
  when,
  noun,
  linkState,
  yours = false,
}: {
  link: SittingLink;
  /** the sitting, for screen readers: 'May 2024 Zone A paper' */
  when: string;
  noun?: string;
  linkState: LinkState;
  yours?: boolean;
}) {
  return (
    <Link
      to={itemPath(link.item)}
      state={linkState}
      className={cx('pp-link', yours && 'is-yours')}
      title={link.item.title}
    >
      <span className="visually-hidden">{when} </span>
      {link.label}
      {noun ? <span className="visually-hidden"> {noun}</span> : null}
      {yours ? <span className="visually-hidden">, your zone</span> : null}
    </Link>
  );
}

function None({ text }: { text: string }) {
  return (
    <span className="pp-row__none">
      <span aria-hidden="true">–</span>
      <span className="visually-hidden">{text}</span>
    </span>
  );
}

function SittingRowView({
  sitting,
  zone,
  linkState,
  board,
}: {
  sitting: Sitting;
  zone: SittingZone['zone'];
  linkState: LinkState;
  board: boolean;
}) {
  const row = sittingRow(sitting, zone);
  const when = sittingLabel(sitting.examYear, sitting.session);
  return (
    <li className="pp-row" aria-label={when} data-hub="paper-sitting">
      <p className="pp-row__when">
        <span className="u-tabular">{when}</span>
        {sitting.session === 'october' ? <span className="pp-row__resit">Resit</span> : null}
      </p>
      <div className="pp-row__files">
        <div className="pp-row__cell pp-row__papers">
          {row.papers.length ? (
            row.papers.map((p) => (
              <span key={p.item.id} className="pp-row__paper">
                <FileLink link={p} when={when} noun="paper" linkState={linkState} yours={p.yours} />
                {board ? <PaperDone itemId={p.item.id} /> : null}
              </span>
            ))
          ) : (
            <span className="pp-row__missing">Paper not in the Hub yet</span>
          )}
        </div>
        <div className="pp-row__cell pp-row__reports">
          {row.reports.length ? (
            row.reports.map((l) => <FileLink key={l.item.id} link={l} when={when} linkState={linkState} />)
          ) : (
            <None text="No examiners’ report yet" />
          )}
        </div>
        <div className="pp-row__cell pp-row__solutions">
          {row.solutions.length ? (
            row.solutions.map((l) => <FileLink key={l.item.id} link={l} when={when} linkState={linkState} />)
          ) : (
            <None text="No solutions yet" />
          )}
        </div>
        <div className="pp-row__cell pp-row__time">
          {row.timeMe ? (
            <Link
              to={timeMeHref(row.timeMe)}
              state={linkState}
              className="pp-time"
              aria-label={`Time me on the ${when} paper${row.papers.length > 1 ? `, ${row.papers[0].label}` : ''}`}
              title="Time me"
            >
              <Timer aria-hidden="true" weight="bold" />
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Sittings as the table's rows, under its header. `board`: the study board is on, so each paper says whether it's
 *  done. */
export function SittingsTable({
  sittings,
  linkState,
  board,
  className,
}: {
  sittings: readonly Sitting[];
  linkState: LinkState;
  board: boolean;
  className?: string;
}) {
  const { zone } = usePapers();
  return (
    <div className={cx('pp-table', className)}>
      <div className="pp-table__head" aria-hidden="true">
        <span>Sitting</span>
        <span>Paper</span>
        <span>Examiners’ report</span>
        <span>Solutions</span>
        <span className="pp-table__time">Time me</span>
      </div>
      <ul role="list" className="pp__sittings">
        {sittings.map((s) => (
          <SittingRowView
            key={`${s.examYear}-${s.session ?? 'any'}`}
            sitting={s}
            zone={zone}
            linkState={linkState}
            board={board}
          />
        ))}
      </ul>
    </div>
  );
}
