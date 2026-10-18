// Today's puzzles in the editor, in plain words: how far each game has got, who a fix reaches, and a group's words
// beside today's board.
import type { ItemOut, TodayGame } from '../../../../api/types';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A game's state today, for its badge: 'Not opened yet', 'In play', 'Fixed once', 'Fixed twice', 'Fixed 3 times'. */
export function stateLabel(game: Pick<TodayGame, 'out' | 'revision'>): string {
  if (!game.out) return 'Not opened yet';
  if (game.revision === 0) return 'In play';
  if (game.revision === 1) return 'Fixed once';
  return game.revision === 2 ? 'Fixed twice' : `Fixed ${game.revision} times`;
}

/** How far students have got with a game today: '12 finished · 3 partway through'. Signed-in students only. */
export function playsLine(game: Pick<TodayGame, 'out' | 'playing' | 'finished'>): string {
  if (!game.out) return 'Nobody has opened it today. An edit reaches it: it’s made when someone does.';
  const parts = [
    game.finished ? `${game.finished} finished` : null,
    game.playing ? `${game.playing} partway through` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' · ') : 'Opened, but nobody has played it yet.';
}

/** Who a fix to today's puzzle reaches. */
export function reachLines(playing: number, finished: number): string[] {
  return [
    playing
      ? `${count(playing, 'student', 'students')} partway through ${playing === 1 ? 'starts' : 'start'} again, with a line saying why.`
      : 'Nobody signed in is partway through it.',
    finished
      ? `${count(finished, 'student', 'students')} who finished ${finished === 1 ? 'keeps their result' : 'keep their results'} and points.`
      : 'Nobody has finished it yet.',
    'Guests partway through start again too.',
  ];
}

/** A group's words beside today's board: the four it shows, and the rest of its list. */
export function boardWords(item: ItemOut, shown: readonly string[]): { shown: string[]; rest: string[] } {
  const words = item.data.game === 'groups' ? item.data.words : [];
  return { shown: [...shown], rest: words.filter((w) => !shown.includes(w)) };
}
