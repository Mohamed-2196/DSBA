// The ⌘K palette's place in the shell: nothing until it is first opened (⌘K, Ctrl+K, "/" or openCommandPalette()),
// then the palette itself, whose code loads at that moment. Its icons and the features it reaches stay out of the
// download every page waits for.
import { lazy, Suspense, useCallback, useState } from 'react';
import { usePaletteShortcuts } from './useShortcuts';

const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));

export function PaletteHost() {
  // What it was first opened with; null until then.
  const [opening, setOpening] = useState<string | null>(null);
  const open = useCallback((query: string) => setOpening((o) => o ?? query), []);
  const toggle = useCallback(() => open(''), [open]);
  usePaletteShortcuts(open, toggle, opening === null);
  return opening === null ? null : (
    <Suspense fallback={null}>
      <CommandPalette opening={opening} />
    </Suspense>
  );
}
