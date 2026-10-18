// Each game drawn small from its own pieces: The Word's marked tiles, Correlations' groups, Data Mine's found line,
// The Daily Query's options, Nearest Neighbour's closest point and a corner of a Sudoku. Decorative: the game's
// name is always beside it.
import type { CSSProperties, ReactElement } from 'react';
import type { GameId } from '../types';

function Word() {
  const top = ['g-hit', 'g-near', 'g-miss', 'g-hit', 'g-hit'];
  return (
    <>
      {top.map((c, i) => (
        <rect key={`t${i}`} className={c} x={3 + i * 8.6} y={13} width={7.4} height={7.4} rx={1.8} />
      ))}
      {top.map((_, i) => (
        <rect key={`b${i}`} className="g-box" x={3.7 + i * 8.6} y={25.7} width={6} height={6} rx={1.5} />
      ))}
    </>
  );
}

function Groups() {
  const rows = [
    ['g-l1', 'g-l1', 'g-l1', 'g-l1'],
    ['g-soft', 'g-pick', 'g-soft', 'g-pick'],
    ['g-pick', 'g-soft', 'g-soft', 'g-soft'],
  ];
  return (
    <>
      {rows.flatMap((row, r) =>
        row.map((c, i) => <rect key={`${r}${i}`} className={c} x={4 + i * 10.4} y={8 + r * 11} width={9} height={9} rx={2.2} />),
      )}
    </>
  );
}

function Search() {
  const dots = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) dots.push(<circle key={`${r}${c}`} className="g-ink" cx={8 + c * 8} cy={8 + r * 8} r={1.5} opacity={0.55} />);
  return (
    <>
      <line x1={8} y1={8} x2={32} y2={32} stroke="currentColor" strokeOpacity={0.22} strokeWidth={7.5} strokeLinecap="round" />
      {dots}
      <circle className="g-ink" cx={8} cy={8} r={2.2} />
      <circle className="g-ink" cx={32} cy={32} r={2.2} />
    </>
  );
}

function Quiz() {
  return (
    <>
      <rect className="g-soft" x={6} y={7} width={36} height={8} rx={4} />
      <rect className="g-hit" x={6} y={19} width={36} height={8} rx={4} />
      <rect className="g-soft" x={6} y={31} width={36} height={8} rx={4} />
      <path d="M33.5 23l2.2 2.2 4-4.4" style={{ fill: 'none', stroke: 'var(--dy-on-hit)' }} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function Nearest() {
  const others: [number, number][] = [
    [9, 12],
    [38, 9],
    [11, 37],
    [39, 36],
    [30, 22],
  ];
  return (
    <>
      <circle cx={21} cy={24} r={11} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.3} strokeDasharray="2.4 2.4" />
      <line className="g-line" x1={21} y1={24} x2={30} y2={22} />
      {others.map(([x, y]) => (
        <circle key={`${x}${y}`} className="g-ink" cx={x} cy={y} r={2.3} opacity={x === 30 ? 1 : 0.45} />
      ))}
      <circle className="g-near" cx={21} cy={24} r={3.6} />
      <circle cx={21} cy={24} r={3.6} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </>
  );
}

function Sudoku() {
  const digits: [number, number, string][] = [
    [0, 0, '5'],
    [1, 2, '3'],
    [2, 1, '8'],
    [0, 2, '1'],
  ];
  return (
    <>
      <rect x={6} y={6} width={36} height={36} rx={4} fill="none" stroke="currentColor" strokeWidth={1.8} />
      <path d="M18 6v36M30 6v36M6 18h36M6 30h36" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.1} />
      <rect className="g-mark" x={18.6} y={18.6} width={10.8} height={10.8} rx={1.5} />
      {digits.map(([r, c, d]) => (
        <text key={`${r}${c}`} className="g-digit" x={12 + c * 12} y={12.4 + r * 12}>
          {d}
        </text>
      ))}
    </>
  );
}

const GLYPHS: Record<GameId, () => ReactElement> = {
  word: Word,
  groups: Groups,
  search: Search,
  quiz: Quiz,
  nearest: Nearest,
  sudoku: Sudoku,
};

/** The game's glyph alone (it takes the size of its box). */
export function GameGlyph({ game }: { game: GameId }) {
  const Glyph = GLYPHS[game];
  return (
    <svg className="dy-glyph" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <Glyph />
    </svg>
  );
}

/** The glyph on a tinted square in the game's colour. */
export function GameTile({ game, size = 56, className }: { game: GameId; size?: number; className?: string }) {
  const style = { '--size': `${size}px`, '--g': `var(--dy-${game})` } as CSSProperties;
  return (
    <span className={`dy-tile-glyph${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
      <GameGlyph game={game} />
    </span>
  );
}
