// A fix to today's puzzle, checked before it's applied: what changes today in plain words, who it reaches, and
// today's puzzle with the fix, its changes marked. A fix that today's puzzle doesn't show changes nobody's game.
import { useId } from 'react';
import type { TodayFixOut } from '../../../api/types';
import { PuzzleView } from './PreviewPart';
import { reachLines } from './lib/today';

export function FixCheck({ check }: { check: TodayFixOut }) {
  const id = useId();
  const changed = check.changes.length > 0;
  return (
    <div className="dcms-fix">
      <section className="dcms-fix__part" aria-labelledby={`${id}-what`}>
        <h3 id={`${id}-what`} className="dcms-fix__title">
          {changed ? 'What changes today' : 'Today’s puzzle stays as it is'}
        </h3>
        {changed ? (
          <ul className="dcms-fix__list">
            {check.changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="dcms__note">
            What you changed isn’t in today’s puzzle, so nobody’s game changes. Your change reaches the days to come.
          </p>
        )}
      </section>
      {changed ? (
        <>
          <section className="dcms-fix__part" aria-labelledby={`${id}-who`}>
            <h3 id={`${id}-who`} className="dcms-fix__title">
              Who it reaches
            </h3>
            <ul className="dcms-fix__list">
              {reachLines(check.playing, check.finished).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <section className="dcms-fix__part" aria-labelledby={`${id}-after`}>
            <h3 id={`${id}-after`} className="dcms-fix__title">
              Today with your fix
            </h3>
            <div className="dcms-fix__puzzle">
              <PuzzleView puzzle={check.after} before={check.before} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
