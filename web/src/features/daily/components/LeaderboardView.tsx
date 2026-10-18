// The leaderboard: the players who chose to show their name, by points this week (from Sunday) or of all time, for
// every year or one. Showing your name is your choice, and off until you turn it on.
import { useState } from 'react';
import { Trophy } from '@phosphor-icons/react';
import { errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import {
  Avatar,
  Button,
  CohortBadge,
  EmptyState,
  Panel,
  QueryError,
  SegmentedControl,
  Skeleton,
  Switch,
  cx,
} from '../../../ui';
import { useDailyLeaderboard, useDailyMe, useShowOnBoard } from '../api';
import type { BoardPeriod, BoardRow } from '../types';

type YearChoice = 'all' | '1' | '2' | '3';

export function LeaderboardView() {
  const { me, openSignIn } = useAuth();
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [year, setYear] = useState<YearChoice>('all');
  const board = useDailyLeaderboard(period, year === 'all' ? null : Number(year));
  const mine = useDailyMe();
  const show = useShowOnBoard();
  const toast = useToast();
  const shown = mine.data?.showOnBoard ?? false;

  const toggle = (on: boolean) =>
    show.mutate(on, {
      onError: (e) => toast.push({ tone: 'alert', title: errorMessage(e, 'Your choice wasn’t saved. Try again.') }),
    });

  return (
    <div className="dh-board">
      {me ? (
        <Panel padding="md" className="dh-board__choice">
          <Switch
            className="dh-board__switch"
            checked={shown}
            onChange={toggle}
            disabled={show.isPending || mine.isPending}
            label="Show my name on the leaderboard"
            description="Your name and year show beside your points. Turn it off at any time."
          />
        </Panel>
      ) : (
        <Panel padding="md" className="dh-board__choice">
          <p className="dh-board__guest">Sign in to play for points and to join the leaderboard.</p>
          <Button variant="primary" onClick={() => openSignIn()}>
            Sign in
          </Button>
        </Panel>
      )}

      <div className="dh-board__filters">
        <SegmentedControl
          label="Period"
          size="sm"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'all', label: 'All time' },
          ]}
        />
        <SegmentedControl
          label="Year"
          size="sm"
          value={year}
          onChange={setYear}
          options={[
            { value: 'all', label: 'All years' },
            { value: '1', label: 'Year 1' },
            { value: '2', label: 'Year 2' },
            { value: '3', label: 'Year 3' },
          ]}
        />
      </div>

      {board.isError ? (
        <QueryError
          error={board.error}
          title="The leaderboard didn’t load"
          onRetry={() => void board.refetch()}
          retrying={board.isFetching}
        />
      ) : board.isPending ? (
        <Panel padding="md">
          <Skeleton lines={5} />
        </Panel>
      ) : board.data.rows.length === 0 ? (
        <Panel padding="none">
          <EmptyState
            icon={Trophy}
            title={period === 'week' ? 'No one on the board this week yet' : 'No one on the board yet'}
            body={
              me && !shown
                ? 'Finish a puzzle and show your name to be the first.'
                : 'Finish today’s puzzles to be the first.'
            }
          />
        </Panel>
      ) : (
        <Panel padding="none">
          <ol className="dh-board__list">
            {board.data.rows.map((row) => (
              <Row key={row.user.id} row={row} />
            ))}
          </ol>
          {board.data.you && !board.data.rows.some((r) => r.you) ? (
            <ol className="dh-board__list dh-board__list--you" aria-label="Your place">
              <Row row={board.data.you} />
            </ol>
          ) : null}
        </Panel>
      )}

      <p className="dh-board__trust">
        Just for fun, on trust: points come from each player’s first try of the day, and nothing stops a look-up.
      </p>

      {me && board.data && !board.data.you && board.data.yourPoints !== null && board.data.yourPoints !== undefined ? (
        <p className="dh-board__yours">
          Your points {period === 'week' ? 'this week' : 'so far'}:{' '}
          <strong className="dy-num">{board.data.yourPoints}</strong>
          {!shown ? '. Show your name to appear on the board.' : null}
        </p>
      ) : null}
    </div>
  );
}

function Row({ row }: { row: BoardRow }) {
  const name = row.user.displayName ?? 'Student';
  return (
    <li className={cx('dh-board__row', row.you && 'is-you', row.rank <= 3 && `is-top is-top-${row.rank}`)}>
      <span className="dh-board__rank dy-num" aria-label={`Rank ${row.rank}`}>
        {row.rank}
      </span>
      <Avatar name={name} size="md" />
      <span className="dh-board__who">
        <span className="dh-board__name">
          {name}
          {row.you ? <span className="dh-board__you">You</span> : null}
        </span>
        {row.user.year ? <CohortBadge year={row.user.year} /> : null}
      </span>
      <span className="dh-board__played dy-num">
        {row.played} <span className="dh-board__unit">played</span>
      </span>
      <span className="dh-board__points dy-num">
        {row.points} <span className="dh-board__unit">pts</span>
      </span>
    </li>
  );
}
