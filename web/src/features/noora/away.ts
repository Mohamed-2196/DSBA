// The pages that keep the screen to themselves: the full Noora page (the same Noora, with more room) and the daily
// games (a game wants the whole page). Mini Noora doesn't wait at rest there: her chat still opens from her shortcut
// or the command palette, and she comes with it. The first visit's year prompt waits for another page too
// (onboarding). Pages without a lane send her away as well (Mascot.css).
import { matchPath } from 'react-router-dom';
import { NOORA_PATH } from './open';

const AWAY = [NOORA_PATH, '/daily/:game', '/daily/:day/:game'];

/** Whether this page keeps the screen to itself: she waits out of sight, and so does the year prompt. */
export function restsAway(pathname: string): boolean {
  return AWAY.some((path) => matchPath({ path, end: true }, pathname) !== null);
}
