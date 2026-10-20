// Today's puzzles as students play them, each with the items it uses. A puzzle someone has opened is kept as it is, so
// a mistake in it is fixed here: the item's dialog shows today's puzzle with the fix before it's applied. A puzzle
// nobody has opened yet is made from the items as they are when someone does, so an edit reaches it.
import { useState } from 'react';
import type { DailyContentOverview, ItemOut, TodayGame } from '../../../api/types';
import { formatDay } from '../../../lib/dates';
import { Badge, Button, cx, EmptyState, glyph, Icon, Panel, QueryError, Skeleton } from '../../../ui';
import { isApiError } from '../../../api/errors';
import { useTodayPuzzles } from './api';
import { ItemDialog } from './ItemDialog';
import { gameInfo, rightOption, titleOf } from './lib/items';
import { boardWords, playsLine, stateLabel } from './lib/today';

export function TodayPart({ overview }: { overview: DailyContentOverview }) {
  const today = useTodayPuzzles();
  const [open, setOpen] = useState<{ item: ItemOut; fix: boolean } | null>(null);

  if (today.isError) {
    if (isApiError(today.error) && today.error.code === 'not_out_yet') {
      return (
        <Panel padding="none">
          <EmptyState
            size="sm"
            title="No puzzles today"
            body="No theme runs yet. Put a theme in the rotation under Themes and weeks."
          />
        </Panel>
      );
    }
    return (
      <QueryError
        error={today.error}
        title="Today’s puzzles didn’t load"
        onRetry={() => void today.refetch()}
        retrying={today.isFetching}
        size="sm"
      />
    );
  }
  if (today.isPending) {
    return (
      <Panel padding="md">
        <Skeleton lines={8} />
      </Panel>
    );
  }
  const { day, theme, games } = today.data;

  return (
    <Panel as="section" padding="md" className="dcms-part" aria-labelledby="dcms-today-title">
      <div className="dcms-part__intro">
        <h3 id="dcms-today-title" className="dcms-part__title">
          Today’s puzzles
        </h3>
        <p className="dcms-today__day">
          <strong>{formatDay(day, { weekday: 'long' })}</strong> · {theme.title}
        </p>
        <p className="dcms__note">
          Found a mistake in today’s puzzle? Fix the item it comes from. You’ll see today’s puzzle with the fix before
          it’s applied. Finished games keep their results; games partway through start again, with a line saying why.
        </p>
      </div>
      <ul className="dcms-today" aria-busy={today.isFetching || undefined}>
        {games.map((g) => (
          <TodayCard key={g.game} game={g} onOpen={(item) => setOpen({ item, fix: g.out })} />
        ))}
      </ul>
      {open ? (
        <ItemDialog
          key={open.item.id}
          game={open.item.game}
          item={open.item}
          themes={overview.themes}
          defaultTheme={open.item.theme}
          fixToday={open.fix}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Panel>
  );
}

function TodayCard({ game, onOpen }: { game: TodayGame; onOpen: (item: ItemOut) => void }) {
  const info = gameInfo(game.game);
  return (
    <li className="dcms-today__game">
      <div className="dcms-today__head">
        <h4 className="dcms-today__name">{info.label}</h4>
        <Badge tone={game.out ? (game.revision ? 'highlight' : 'signal') : 'outline'} size="sm">
          {stateLabel(game)}
        </Badge>
      </div>
      <p className="dcms-today__plays">{playsLine(game)}</p>
      {game.puzzle ? (
        <TodayItems game={game} onOpen={onOpen} />
      ) : (
        <p className="dcms-check">
          <Icon glyph={glyph.error} /> No puzzle today. {game.problem}
        </p>
      )}
      {game.out && game.fixesLeft === 0 ? (
        <p className="dcms__note">It has had as many fixes as a day takes. Edits now reach the days to come.</p>
      ) : null}
    </li>
  );
}

/** The items today's puzzle uses, as it shows them, each with its fix. */
function TodayItems({ game, onOpen }: { game: TodayGame; onOpen: (item: ItemOut) => void }) {
  const p = game.puzzle;
  const fixable = !game.out || game.fixesLeft > 0;
  const action = (item: ItemOut, name: string) =>
    fixable ? (
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<Icon glyph={glyph.edit} />}
        className="dcms-today__fix"
        aria-label={`${game.out ? 'Fix' : 'Edit'} “${name}”`}
        onClick={() => onOpen(item)}
      >
        {game.out ? 'Fix' : 'Edit'}
      </Button>
    ) : null;

  if (!p) return null;
  switch (p.game) {
    case 'word':
    case 'nearest': {
      const item = game.items[0];
      if (!item) return null;
      return (
        <div className="dcms-today__row">
          <div className="dcms-today__main">
            <p className="dcms-preview__answer">{p.game === 'word' ? p.answer : p.target}</p>
            {p.game === 'nearest' ? <p className="dcms-today__detail">Closest: {p.closest.join(', ')}</p> : null}
          </div>
          {action(item, titleOf(item.data))}
        </div>
      );
    }
    case 'groups':
      return (
        <ol className="dcms-today__rows">
          {p.groups.map((g, i) => {
            const item = game.items[i];
            const words = item ? boardWords(item, g.words) : { shown: g.words, rest: [] };
            return (
              <li key={`${g.level}-${g.label}`} className="dcms-today__row">
                <div className="dcms-today__main">
                  <p className="dcms-today__title">
                    <Badge tone="outline" size="sm">{`Level ${g.level}`}</Badge> <strong>{g.label}</strong>
                  </p>
                  <p className="dcms-today__detail">
                    <span className="dcms-today__words">{words.shown.join(', ')}</span>
                    {words.rest.length ? (
                      <span className="dcms-today__rest"> · not on today’s board: {words.rest.join(', ')}</span>
                    ) : null}
                  </p>
                </div>
                {item ? action(item, g.label) : null}
              </li>
            );
          })}
        </ol>
      );
    case 'quiz':
      return (
        <ol className="dcms-today__rows">
          {p.questions.map((q, i) => {
            const item = game.items[i];
            return (
              <li key={`${i}-${q.prompt}`} className={cx('dcms-today__row', !item && 'is-made')}>
                <div className="dcms-today__main">
                  <p className="dcms-today__title">{q.prompt}</p>
                  <p className="dcms-today__detail">
                    {item?.data.game === 'quiz'
                      ? `Right answer: ${rightOption(item.data)}`
                      : `Right answer: ${q.options[q.answer] ?? ''}. Made from the modules in Manage → Modules.`}
                  </p>
                </div>
                {item ? action(item, q.prompt) : null}
              </li>
            );
          })}
        </ol>
      );
    case 'search':
      return (
        <>
          <ul className="dcms-today__words-list">
            {game.items.map((item) => {
              const word = titleOf(item.data);
              return (
                <li key={item.id} className="dcms-today__row is-word">
                  <span className="dcms-today__word">{word}</span>
                  {action(item, word)}
                </li>
              );
            })}
          </ul>
          <details className="dcms-today__grid">
            <summary>Show the grid</summary>
            <pre className="dcms-preview__grid" aria-label="Today’s grid">
              {p.grid.map((row) => row.split('').join(' ')).join('\n')}
            </pre>
          </details>
        </>
      );
  }
}
