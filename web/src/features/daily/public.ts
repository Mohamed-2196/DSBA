// Public exports for the Daily feature.
// Exposes the Home card "Today's Daily" for the dashboard grid, and queries.
import { lazy } from 'react';

export { DailyCard } from './DailyCard';
export { useDailyToday } from './api';

// Manage → Daily puzzles (holders of content.edit): themes and weeks, each game's items, the guess list, the
// vocabulary and a preview of any day.
// Manage's editor loads with Manage (inside its Suspense), so no other page carries it.
export const DailyContentEditor = lazy(() =>
  import('./editor/DailyContentEditor').then((m) => ({ default: m.DailyContentEditor })),
);

// The style guide's contrast table of the games' colours.
export { GameColours } from './components/GameColours';
