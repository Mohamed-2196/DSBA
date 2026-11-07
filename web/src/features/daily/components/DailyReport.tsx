// DSBA Daily's finale, on the hub once every game of the day is done: a trophy, today's total counting up, how many
// were solved and the best game, and each game's points as a bar; with three bursts of confetti the first time this
// device sees it that day, and again on "Celebrate again".
import { useEffect, useState, type CSSProperties } from 'react';
import { glyph, Icon, IconButton } from '../../../ui';
import { cheeredFor } from '../lib/storage';
import type { DailyToday } from '../types';
import { Confetti } from './Confetti';
import { CountUp } from './CountUp';
import { GameGlyph } from './GameGlyph';

export function DailyReport({ today }: { today: DailyToday }) {
  const [bursts, setBursts] = useState<number[]>([]);
  const [cheer, setCheer] = useState(0);

  const games = today.games;
  const total = games.reduce((sum, g) => sum + g.points, 0);
  const solved = games.filter((g) => g.status === 'won').length;
  const best = games.reduce((a, b) => (b.points > a.points ? b : a));

  const celebrate = () => {
    // Three bursts a moment apart, so it reads as a finale rather than one pop.
    const base = Date.now();
    [0, 350, 700].forEach((delay, i) => window.setTimeout(() => setBursts((b) => [...b, base + i]), delay));
    window.setTimeout(() => setBursts([]), 2600);
    setCheer((c) => c + 1);
  };

  useEffect(() => {
    if (!cheeredFor(today.day)) celebrate();
  }, [today.day]);

  return (
    <section className="dd-report" aria-labelledby="dd-report-title">
      <div className="dd-report__head">
        <span key={cheer} className="dd-report__trophy" aria-hidden="true">
          <Icon glyph={glyph.trophy} />
        </span>
        <div className="dd-report__intro">
          <h2 id="dd-report-title" className="dd-report__title">
            All {games.length} done today!
          </h2>
          <p className="dd-report__line">Come back tomorrow at midnight for new puzzles.</p>
        </div>
        <IconButton label="Celebrate again" icon={<Icon glyph={glyph.sparkle} />} onClick={celebrate} />
      </div>
      <div className="dd-report__body">
        <div>
          <p className="dd-report__label">Today’s total</p>
          <p className="dd-report__total dy-num">
            <CountUp value={total} />
            <span className="dd-report__max"> / {games.length * 100}</span>
          </p>
          <dl className="dd-report__facts">
            <div>
              <dt>Solved</dt>
              <dd className="dy-num">
                {solved} of {games.length}
              </dd>
            </div>
            <div>
              <dt>Best game</dt>
              <dd>{best.info.title}</dd>
            </div>
          </dl>
        </div>
        <ul className="dd-report__bars" aria-label="Points per game">
          {games.map((g, i) => (
            <li
              key={g.info.id}
              style={{ '--g': `var(--dd-${g.info.id})`, '--fill': g.points / 100, '--n': i } as CSSProperties}
            >
              <span className="dd-report__glyph" aria-hidden="true">
                <GameGlyph game={g.info.id} />
              </span>
              <span className="dd-report__name">{g.info.title}</span>
              <span className="dd-report__track" aria-hidden="true">
                <span className="dd-report__fill" />
              </span>
              <span className="dd-report__points dy-num">{g.points}</span>
            </li>
          ))}
        </ul>
      </div>
      {bursts.map((b) => (
        <Confetti key={b} fire={b} />
      ))}
    </section>
  );
}
