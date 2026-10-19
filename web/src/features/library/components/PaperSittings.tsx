// A module's past papers as a table, newest sitting first: one row per sitting with each zone's paper, the examiners'
// report, the solutions and Time me. On phones a row stacks: the sitting, then its links. Used on the module's Files
// tab (#papers) and as the library's Past papers view for one module. Papers without an exam year follow as "Other
// papers".
import { Exam, Timer } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryItem, Sitting, SittingZone } from '../../../api/types';
import { RTC_NOTE, sittingLabel } from '../../../lib/exams';
import { BREAKPOINTS, useMediaQuery } from '../../../state';
import { Button, Panel, Skeleton, cx } from '../../../ui';
import { PaperDone, SittingsDone } from '../../board/public';
import { usePapers } from '../../papers/public';
import { itemPath } from '../api';
import { sittingFiles, sittingRow, usePaperSittings, type SittingLink } from '../papers';
import type { LinkState } from './FileCard';
import '../ModuleFiles.css';
import './PaperSittings.css';

/** Sittings a phone shows before "Show all": about a screen's worth. Wider screens show every sitting. */
const FIRST_ON_PHONES = 8;

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

/** A module's past papers by sitting. Renders nothing while the module has none. `board`: the study board is on, so
 *  the heading says how many sittings are done. `headingLevel`: 3 inside the module's Files tab, 2 in the library. */
export function PaperSittings({
  moduleId,
  linkState,
  renderOther,
  board,
  headingLevel = 3,
}: {
  moduleId: string;
  linkState: LinkState;
  renderOther: (items: LibraryItem[]) => ReactNode;
  board: boolean;
  headingLevel?: 2 | 3;
}) {
  const papers = usePaperSittings(moduleId);
  const { zone } = usePapers();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [all, setAll] = useState(false);
  const H = headingLevel === 2 ? 'h2' : 'h3';
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
  const capped = isMobile && !all && sittings.length > FIRST_ON_PHONES + 2;
  const visible = capped ? sittings.slice(0, FIRST_ON_PHONES) : sittings;
  return (
    <>
      {sittings.length ? (
        <section id="papers" className="lib-mf__group pp" aria-labelledby="lib-mf-sittings" data-hub="paper-sittings">
          <div className="pp__head">
            <H id="lib-mf-sittings" className="lib-mf__h">
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
            </H>
            <p className="pp__intro">Newest first.{zone ? ' Your zone’s paper is marked.' : ''}</p>
          </div>
          <Panel as="div" padding="none" className="pp__panel">
            <div className="pp-table__head" aria-hidden="true">
              <span>Sitting</span>
              <span>Paper</span>
              <span>Examiners’ report</span>
              <span>Solutions</span>
              <span className="pp-table__time">Time me</span>
            </div>
            <ul role="list" className="pp__sittings">
              {visible.map((s) => (
                <SittingRowView
                  key={`${s.examYear}-${s.session ?? 'any'}`}
                  sitting={s}
                  zone={zone}
                  linkState={linkState}
                  board={board}
                />
              ))}
            </ul>
          </Panel>
          {sittings.some((s) => s.zones.some((z) => z.zone === 'RTC')) ? <p className="pp__note">{RTC_NOTE}</p> : null}
          {capped || all ? (
            <div className="pp__more">
              <Button size="sm" variant="ghost" onClick={() => setAll((a) => !a)} aria-expanded={all}>
                {all ? 'Show fewer sittings' : `Show all ${sittings.length} sittings`}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {other.length ? (
        <section className="lib-mf__group" aria-labelledby="lib-mf-other-papers">
          <H id="lib-mf-other-papers" className="lib-mf__h">
            Other papers
            <span className="lib-mf__count">{other.length}</span>
          </H>
          <p className="pp__intro">Mocks, sample papers and papers whose sitting isn’t known.</p>
          {renderOther(other)}
        </section>
      ) : null}
    </>
  );
}
