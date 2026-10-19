// A module's past papers as a table, newest sitting first: one row per sitting with each zone's paper, the examiners'
// report, the solutions and Time me. On phones a row stacks: the sitting, then its links. Used on the module's Files
// tab (#papers) and as the library's Past papers view for one module. Papers without an exam year follow as "Other
// papers".
import type { ReactNode } from 'react';
import type { LibraryItem } from '../../../api/types';
import { RTC_NOTE } from '../../../lib/exams';
import { BREAKPOINTS, useEntryState, useMediaQuery } from '../../../state';
import { Button, DocThumb, Panel, Skeleton } from '../../../ui';
import { SittingsDone } from '../../board/public';
import { usePapers } from '../../papers/public';
import { sittingFiles, usePaperSittings } from '../papers';
import type { LinkState } from './FileCard';
import { SittingsTable } from './SittingsTable';
import '../ModuleFiles.css';
import './PaperSittings.css';

/** Sittings a phone shows before "Show all": about a screen's worth. Wider screens show every sitting. */
const FIRST_ON_PHONES = 8;

/** A module's past papers by sitting. Renders nothing while the module has none. `board`: boards are on, so
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
  // Kept with the visit: back from a paper, the list is as long as it was (ST-42).
  const [all, setAll] = useEntryState(`sittings.${moduleId}`, false);
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
              <DocThumb tone="paper" size="sm" className="pp__icon" />
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
            <SittingsTable sittings={visible} linkState={linkState} board={board} />
          </Panel>
          {sittings.some((s) => s.zones.some((z) => z.zone === 'RTC')) ? <p className="pp__note">{RTC_NOTE}</p> : null}
          {capped || all ? (
            <div className="pp__more">
              <Button size="sm" variant="ghost" onClick={() => setAll(!all)} aria-expanded={all}>
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
