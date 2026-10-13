// What the shell needs to open Mini Noora from its own bars (the top bar on tablets, the tab bar on phones).
import { useCallback, type MouseEvent } from 'react';
import { useAuth } from '../../auth';
import { PANEL_ID, toggleNoora, useNooraOpen } from './dock';
import { useMiniNooraHidden } from './visibility';

export interface NooraLauncher {
  /** she is on for this person and not hidden on this device: show the launcher */
  shown: boolean;
  /** her panel is open */
  open: boolean;
  /** for a launcher's onClick: opens the panel (focus comes back to the launcher when it closes), or closes it */
  toggle: (e: MouseEvent<HTMLElement>) => void;
  /** spread on the launcher: aria-expanded, aria-controls and the hook the tests use */
  props: { 'aria-expanded': boolean; 'aria-controls': string; 'data-hub': 'noora-launcher' };
}

export function useNooraLauncher(): NooraLauncher {
  const { featureOn } = useAuth();
  const hidden = useMiniNooraHidden();
  const open = useNooraOpen();
  const toggle = useCallback((e: MouseEvent<HTMLElement>) => toggleNoora(e.currentTarget), []);
  return { shown: featureOn('noora') && !hidden, open, toggle, props: { 'aria-expanded': open, 'aria-controls': PANEL_ID, 'data-hub': 'noora-launcher' } };
}
