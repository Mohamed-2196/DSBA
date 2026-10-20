// Past days: a month of sets on a calendar, how many of each day's games you finished, and the day you pick with
// its six games to play again. Past days are practice: they never count for points.
import { Link } from 'react-router-dom';
import { MONTHS, WEEKDAYS, type DayKey } from '../../../lib/dates';
import { useQueryParam } from '../../../state';
import { cx, glyph, Icon, IconButton, QueryError, Skeleton } from '../../../ui';
import { useDailyCalendar } from '../api';
import { dayLabel, monthOf, monthWeeks, setNumber, shiftMonth } from '../lib/days';
import type { CalendarDay, DailyToday } from '../types';
import { GameTile } from './GameGlyph';

const monthTitle = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;

export function ArchiveView({ today }: { today: DailyToday }) {
  const first = monthOf(today.firstDay);
  const last = monthOf(today.day);
  const [picked, setPicked] = useQueryParam('day');
  const [monthParam, setMonth] = useQueryParam('month');
  const month = monthParam && monthParam >= first && monthParam <= last ? monthParam : picked ? monthOf(picked) : last;
  const calendar = useDailyCalendar(month);
  const days = new Map((calendar.data?.days ?? []).map((d) => [d.day, d]));
  const total = calendar.data?.total ?? today.games.length;
  const chosen = picked && picked >= today.firstDay && picked <= today.day ? picked : null;
  const chosenDay = chosen ? days.get(chosen) : undefined;

  return (
    <div className="dh-past">
      <section className="dh-cal" aria-labelledby="dh-cal-title">
        <div className="dh-cal__head">
          <h2 id="dh-cal-title" className="dh-cal__title">
            {monthTitle(month)}
          </h2>
          <div className="dh-cal__nav">
            <IconButton
              label="Previous month"
              icon={<Icon glyph={glyph.chevronLeft} />}
              disabled={month <= first}
              onClick={() => setMonth(shiftMonth(month, -1), { replace: true })}
            />
            <IconButton
              label="Next month"
              icon={<Icon glyph={glyph.chevronRight} />}
              disabled={month >= last}
              onClick={() => setMonth(shiftMonth(month, 1), { replace: true })}
            />
          </div>
        </div>
        {calendar.isError ? (
          <QueryError
            error={calendar.error}
            title="Past days didn’t load"
            onRetry={() => void calendar.refetch()}
            retrying={calendar.isFetching}
            size="sm"
          />
        ) : (
          <table className="dh-cal__grid" aria-busy={calendar.isPending || undefined}>
            <thead>
              <tr>
                {WEEKDAYS.map((w) => (
                  <th key={w.long} scope="col" abbr={w.long}>
                    <span aria-hidden="true">{w.two}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthWeeks(month).map((week, i) => (
                <tr key={i}>
                  {week.map((d, j) => (
                    <td key={d ?? `x${j}`}>
                      {d ? (
                        <DayCell
                          day={d}
                          data={days.get(d)}
                          total={total}
                          today={today.day}
                          picked={chosen === d}
                          onPick={() => setPicked(d, { replace: true })}
                        />
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="dh-day" aria-live="polite">
        {chosen ? (
          <DayPanel day={chosen} data={chosenDay} today={today} loading={calendar.isPending} />
        ) : (
          <div className="dh-day__empty">
            <p className="dh-day__title">Pick a day</p>
            <p className="dh-day__note">Play any day’s puzzles again for practice. Points only come from today’s.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function DayCell({
  day,
  data,
  total,
  today,
  picked,
  onPick,
}: {
  day: DayKey;
  data: CalendarDay | undefined;
  total: number;
  today: DayKey;
  picked: boolean;
  onPick: () => void;
}) {
  const out = Boolean(data) || day === today;
  const done = data?.finished.length ?? 0;
  const label = `${dayLabel(day, today)}${data ? `, ${done} of ${total} finished` : ''}${day === today ? ', today' : ''}`;
  return (
    <button
      type="button"
      className={cx('dh-cal__day', day === today && 'is-today', picked && 'is-picked', done >= total && 'is-full')}
      disabled={!out}
      onClick={onPick}
      aria-label={label}
      aria-pressed={picked}
    >
      <span className="dh-cal__num">{Number(day.slice(8))}</span>
      {out ? (
        <span className="dh-cal__dots" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx(i < done && 'is-on')} />
          ))}
        </span>
      ) : null}
    </button>
  );
}

function DayPanel({
  day,
  data,
  today,
  loading,
}: {
  day: DayKey;
  data: CalendarDay | undefined;
  today: DailyToday;
  loading: boolean;
}) {
  const isToday = day === today.day;
  const theme = isToday ? today.theme : data?.theme;
  return (
    <div className="dh-day__card">
      <p className="dh-day__kicker dy-num">Daily #{setNumber(day, today.firstDay)}</p>
      <h3 className="dh-day__title">{dayLabel(day, today.day)}</h3>
      {theme ? <p className="dh-day__theme">{theme.title}</p> : loading ? <Skeleton width="8em" /> : null}
      <p className="dh-day__note">
        {isToday
          ? 'Today’s puzzles count for points and your streak.'
          : 'Practice: puzzles from past days don’t count for points.'}
      </p>
      <ul className="dh-day__games">
        {today.games.map((g) => {
          const finished = isToday
            ? g.status === 'won' || g.status === 'lost'
            : (data?.finished.includes(g.info.id) ?? false);
          return (
            <li key={g.info.id}>
              <Link className="dh-day__game" to={isToday ? `/daily/${g.info.id}` : `/daily/${day}/${g.info.id}`}>
                <GameTile game={g.info.id} size={36} />
                <span className="dh-day__name">{g.info.title}</span>
                {finished ? (
                  <span className="dh-day__state is-done">
                    <Icon glyph={glyph.success} /> Done
                  </span>
                ) : (
                  <span className="dh-day__state">
                    <Icon glyph={glyph.play} /> {isToday ? 'Play' : 'Practise'}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
