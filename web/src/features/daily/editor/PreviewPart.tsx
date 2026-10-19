// A day's puzzles with their answers: as they went out for a day that is out, or as the content would make them for
// a day to come (nothing is stored, so adding or retiring items before then can still change it).
import { Check, WarningCircle } from '@phosphor-icons/react';
import { Fragment, useState, type ReactNode } from 'react';
import type { DailyContentOverview, PreviewGame } from '../../../api/types';
import { addDaysToKey, formatDay, isDayKey } from '../../../lib/dates';
import { Badge, Button, Highlight, Panel, QueryError, Skeleton, TextField, cx } from '../../../ui';
import { useDailyPreview } from './api';
import { gameInfo } from './lib/items';

/** A day's puzzle with its answers, as the editor shows it. */
export type PreviewPuzzle = NonNullable<PreviewGame['puzzle']>;

export function PreviewPart({ overview }: { overview: DailyContentOverview }) {
  const [day, setDay] = useState(() => addDaysToKey(overview.today, 1));
  const valid = isDayKey(day);
  const preview = useDailyPreview(valid ? day : '');
  const last = addDaysToKey(overview.today, 365);
  const quick = [
    { label: 'Today', day: overview.today },
    { label: 'Tomorrow', day: addDaysToKey(overview.today, 1) },
    { label: 'In a week', day: addDaysToKey(overview.today, 7) },
  ];

  return (
    <Panel as="section" padding="md" className="dcms-part" aria-labelledby="dcms-preview-title">
      <div className="dcms-part__intro">
        <h3 id="dcms-preview-title" className="dcms-part__title">
          Preview a day
        </h3>
        <p className="dcms__note">
          A day’s puzzles with their answers. A day that is out shows what went out. A day to come shows what the
          content makes now, so adding or retiring items before then can change it.
        </p>
      </div>
      <div className="dcms-preview__pick">
        <TextField
          label="Day"
          type="date"
          value={day}
          min={overview.firstDay}
          max={last}
          onChange={(e) => setDay(e.target.value)}
          className="dcms-preview__day"
        />
        <div className="dcms-preview__quick" role="group" aria-label="Go to">
          {quick.map((q) => (
            <Button
              key={q.label}
              size="sm"
              variant={q.day === day ? 'primary' : 'secondary'}
              onClick={() => setDay(q.day)}
            >
              {q.label}
            </Button>
          ))}
        </div>
      </div>
      {!valid ? (
        <p className="dcms__note">Pick a day.</p>
      ) : preview.isError ? (
        <QueryError
          error={preview.error}
          title="The preview didn’t load"
          onRetry={() => void preview.refetch()}
          retrying={preview.isFetching}
          size="sm"
        />
      ) : preview.isPending ? (
        <Skeleton lines={8} />
      ) : (
        <div className="dcms-preview" aria-busy={preview.isFetching || undefined}>
          <p className="dcms-preview__theme">
            <strong>{formatDay(preview.data.day, { weekday: 'long' })}</strong> · {preview.data.theme.title}
          </p>
          <ul className="dcms-preview__games">
            {preview.data.games.map((g) => (
              <li key={g.game} className="dcms-preview__game">
                <h4 className="dcms-preview__name">
                  {gameInfo(g.game).label}
                  {g.puzzle ? (
                    <Badge tone={g.fixed ? 'signal' : 'outline'} size="sm">
                      {g.fixed ? 'Out: as it went out' : 'Planned'}
                    </Badge>
                  ) : null}
                </h4>
                <PreviewBody game={g} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function PreviewBody({ game }: { game: PreviewGame }) {
  if (!game.puzzle) {
    return (
      <p className="dcms-check">
        <WarningCircle aria-hidden="true" weight="fill" /> No puzzle that day. {game.problem}
      </p>
    );
  }
  return <PuzzleView puzzle={game.puzzle} />;
}

/** Marks what a fix changed, against the puzzle as it was (`on`). */
function Changed({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <Highlight>{children}</Highlight> : <>{children}</>;
}

/**
 * A day's puzzle with its answers. Given `before` (today's puzzle as it is), it marks what a fix changes: a new answer
 * or secret word, a group's new words or name, a new word in Data Mine, a question that reads differently.
 */
export function PuzzleView({ puzzle, before }: { puzzle: PreviewPuzzle; before?: PreviewPuzzle }) {
  switch (puzzle.game) {
    case 'word': {
      const was = before?.game === 'word' ? before.answer : puzzle.answer;
      return (
        <p className="dcms-preview__answer">
          <Changed on={was !== puzzle.answer}>{puzzle.answer}</Changed>
        </p>
      );
    }
    case 'groups': {
      const was = before?.game === 'groups' ? before.groups : null;
      return (
        <ol className="dcms-preview__groups">
          {puzzle.groups.map((g, i) => {
            const old = was?.[i];
            return (
              <li key={`${g.level}-${g.label}`}>
                <Badge tone="outline" size="sm">{`Level ${g.level}`}</Badge>{' '}
                <strong>
                  <Changed on={Boolean(old && old.label !== g.label)}>{g.label}</Changed>
                </strong>
                :{' '}
                {g.words.map((w, j) => (
                  <Fragment key={w}>
                    {j ? ', ' : null}
                    <Changed on={Boolean(old && !old.words.includes(w))}>{w}</Changed>
                  </Fragment>
                ))}
              </li>
            );
          })}
        </ol>
      );
    }
    case 'search': {
      const was = before?.game === 'search' ? before.words : null;
      return (
        <div className="dcms-preview__search">
          <p className="dcms-preview__words">
            {puzzle.words.map((w, i) => (
              <Fragment key={w}>
                {i ? ', ' : null}
                <Changed on={Boolean(was && !was.includes(w))}>{w}</Changed>
              </Fragment>
            ))}
          </p>
          <pre className="dcms-preview__grid" aria-label="The grid">
            {puzzle.grid.map((row) => row.split('').join(' ')).join('\n')}
          </pre>
        </div>
      );
    }
    case 'quiz': {
      const was = before?.game === 'quiz' ? before.questions : null;
      return (
        <ol className="dcms-preview__questions">
          {puzzle.questions.map((q, n) => {
            const old = was?.[n];
            const fixed = Boolean(old && JSON.stringify(old) !== JSON.stringify(q));
            return (
              <li key={`${n}-${q.prompt}`}>
                <p className="dcms-preview__prompt">
                  {fixed ? (
                    <>
                      <Badge tone="highlight" size="sm">
                        Fixed
                      </Badge>{' '}
                    </>
                  ) : null}
                  {q.prompt}
                  {q.source ? <span className="dcms-preview__source"> · {q.source}</span> : null}
                </p>
                <ul className="dcms-preview__options">
                  {q.options.map((o, i) => (
                    <li key={`${i}-${o}`} className={cx(i === q.answer && 'is-right')}>
                      {i === q.answer ? <Check aria-label="Right answer" weight="bold" /> : null}
                      {o}
                    </li>
                  ))}
                </ul>
                {fixed && old?.explain !== q.explain ? <p className="dcms-preview__explain">{q.explain}</p> : null}
              </li>
            );
          })}
        </ol>
      );
    }
    case 'nearest': {
      const was = before?.game === 'nearest' ? before.target : puzzle.target;
      return (
        <>
          <p className="dcms-preview__secret">
            <Changed on={was !== puzzle.target}>{puzzle.target}</Changed>
          </p>
          <p className="dcms-preview__words">Closest: {puzzle.closest.join(', ')}</p>
        </>
      );
    }
  }
}
