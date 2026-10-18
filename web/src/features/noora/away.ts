// The pages where Mini Noora does not wait at rest: the full Noora page (the same Noora, with more room) and the
// daily games (a game wants the whole page). Her chat still opens there from her shortcut or the command palette,
// and she comes with it. Pages without a lane send her away too (Mascot.css).
import { matchPath } from 'react-router-dom';
import { NOORA_PATH } from './open';

const AWAY = [NOORA_PATH, '/daily/:game', '/daily/:day/:game'];

/** Whether she waits out of sight on this page. */
export function restsAway(pathname: string): boolean {
  return AWAY.some((path) => matchPath({ path, end: true }, pathname) !== null);
}
