// When a new build of the hub is installed and waiting (lib/pwa.ts), one toast offers to switch to it. It stays until
// the student reloads or closes it; nothing reloads on its own, so no half-written post is lost.
import { useEffect } from 'react';
import { useToast } from '../state';
import { applyUpdate, useUpdateReady } from '../lib/pwa';

export function UpdatePrompt() {
  const ready = useUpdateReady();
  const { push } = useToast();
  useEffect(() => {
    if (!ready) return;
    push({
      title: 'A new version of DSBA Hub is ready',
      body: 'Reload to use it. Save anything you’re writing first.',
      duration: 0,
      action: { label: 'Reload', onClick: applyUpdate },
    });
  }, [ready, push]);
  return null;
}
