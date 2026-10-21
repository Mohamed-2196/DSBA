// "Carry on": the paper being timed, then the last papers, files, notes and lessons opened in this browser, each a
// link back to it (a paper with the note written on it). On Home for everything, and on a module's Overview for that
// module's. Renders nothing while there is nothing to pick up.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx, DocThumb, Icon, Panel, glyph, timeAgo } from '../../ui';
import { ClockText, LibraryCoverById, timedPaperPath } from '../library/public';
import type { CarryOnRow, VisitKind } from './recent';
import { useCarryOn } from './useCarryOn';
import './CarryOn.css';

/** Notes are drawn documents; a lesson is a play button. Files use their first page. */
const ICON: Record<'note' | 'lesson', ReactNode> = {
  note: <DocThumb tone="note" size="md" />,
  lesson: <Icon glyph={glyph.play} size={24} />,
};
const WHAT: Record<VisitKind, string> = { paper: 'Past paper', file: 'File', note: 'Note', lesson: 'Lesson' };

function Row({ row }: { row: CarryOnRow }) {
  const { visit, note } = row;
  return (
    <li className="carry__item">
      <Link to={visit.path} className="carry__row">
        <span className="carry__icon" aria-hidden="true">
          {visit.kind === 'paper' || visit.kind === 'file' ? (
            <LibraryCoverById id={visit.id} kind={visit.kind === 'paper' ? 'past-paper' : 'other'} />
          ) : (
            ICON[visit.kind]
          )}
        </span>
        <span className="carry__text">
          <span className="carry__title">{visit.title}</span>
          <span className="carry__meta">
            {WHAT[visit.kind]} · opened {timeAgo(visit.at)}
          </span>
        </span>
      </Link>
      {note ? (
        <Link to={note.path} className="carry__note" data-hub="carry-on-note">
          <Icon glyph={glyph.notebook} />
          Your notes on it
        </Link>
      ) : null}
    </li>
  );
}

/** The list; `className` for the frame it sits in. */
export function CarryOn({
  moduleId = null,
  n = 5,
  className,
}: {
  moduleId?: string | null;
  n?: number;
  className?: string;
}) {
  const { timed, timedNote, rows, any } = useCarryOn({ moduleId, n });
  if (!any) return null;
  const few = rows.length + (timed ? 1 : 0) < 3;
  return (
    <Panel padding="none" className={cx('carry', className)} data-hub="carry-on">
      <ul role="list">
        {timed ? (
          <li className="carry__item carry__item--timed">
            <Link to={timedPaperPath(timed.paper)} className="carry__row">
              <span className="carry__icon" aria-hidden="true">
                <LibraryCoverById id={timed.paper.id} kind="past-paper" />
              </span>
              <span className="carry__text">
                <span className="carry__title">{timed.paper.title}</span>
                <span className="carry__meta">Timed attempt</span>
                {/* The clock, set in mono as the brand's timer is (BRAND.md §3). */}
                <span className="carry__clock">
                  <ClockText timer={timed} />
                </span>
              </span>
            </Link>
            {timedNote ? (
              <Link to={timedNote.path} className="carry__note" data-hub="carry-on-note">
                <Icon glyph={glyph.notebook} />
                Your notes on it
              </Link>
            ) : null}
          </li>
        ) : null}
        {rows.map((row) => (
          <Row key={`${row.visit.kind}:${row.visit.id}`} row={row} />
        ))}
      </ul>
      {few && !moduleId ? (
        <p className="carry__hint">
          The papers, notes and lessons you open show here. They’re kept on this device only.
        </p>
      ) : null}
    </Panel>
  );
}
