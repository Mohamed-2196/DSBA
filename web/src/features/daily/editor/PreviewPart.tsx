// A day's puzzles with their answers: as they went out for a day that is out, or as the content would make them for
// a day to come (nothing is stored, so adding or retiring items before then can still change it).
import { Check, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import type { DailyContentOverview, PreviewGame } from '../../../api/types';
import { addDaysToKey, formatDay, isDayKey } from '../../../lib/dates';
import { Badge, Button, Panel, QueryError, Skeleton, TextField, cx } from '../../../ui';
import { useDailyPreview } from './api';
import { gameInfo } from './lib/items';

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
          A day’s puzzles with their answers. A day that is out shows what went out. A day to come shows what the content makes now, so adding or retiring items before then can change it.
        </p>
      </div>
      <div className="dcms-preview__pick">
        <TextField label="Day" type="date" value={day} min={overview.firstDay} max={last} onChange={(e) => setDay(e.target.value)} className="dcms-preview__day" />
        <div className="dcms-preview__quick" role="group" aria-label="Go to">
          {quick.map((q) => (
            <Button key={q.label} size="sm" variant={q.day === day ? 'primary' : 'secondary'} onClick={() => setDay(q.day)}>
              {q.label}
            </Button>
          ))}
        </div>
      </div>
      {!valid ? (
        <p className="dcms__note">Pick a day.</p>
      ) : preview.isError ? (
        <QueryError error={preview.error} title="The preview didn’t load" onRetry={() => void preview.refetch()} retrying={preview.isFetching} size="sm" />
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
  const p = game.puzzle;
  if (!p) {
    return (
      <p className="dcms-check">
        <WarningCircle aria-hidden="true" weight="fill" /> No puzzle that day. {game.problem}
      </p>
    );
  }
  switch (p.game) {
    case 'word':
      return <p className="dcms-preview__answer">{p.answer}</p>;
    case 'groups':
      return (
        <ol className="dcms-preview__groups">
          {p.groups.map((g) => (
            <li key={g.label}>
              <Badge tone="outline" size="sm">{`Level ${g.level}`}</Badge> <strong>{g.label}</strong>: {g.words.join(', ')}
            </li>
          ))}
        </ol>
      );
    case 'search':
      return (
        <div className="dcms-preview__search">
          <p className="dcms-preview__words">{p.words.join(', ')}</p>
          <pre className="dcms-preview__grid" aria-label="The grid">
            {p.grid.map((row) => row.split('').join(' ')).join('\n')}
          </pre>
        </div>
      );
    case 'quiz':
      return (
        <ol className="dcms-preview__questions">
          {p.questions.map((q) => (
            <li key={q.prompt}>
              <p className="dcms-preview__prompt">
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
            </li>
          ))}
        </ol>
      );
    case 'nearest':
      return (
        <>
          <p className="dcms-preview__secret">{p.target}</p>
          <p className="dcms-preview__words">Closest: {p.closest.join(', ')}</p>
        </>
      );
  }
}
