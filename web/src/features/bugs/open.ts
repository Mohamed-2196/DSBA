// Whether the "Report a bug" dialog is open: the account menu, the More drawer, the command palette and About open
// it; the shell mounts it once.
import { useSyncExternalStore } from 'react';

const CHANGED = 'hub:bug-report-open';
let open = false;

function set(next: boolean): void {
  if (open === next) return;
  open = next;
  window.dispatchEvent(new Event(CHANGED));
}

/** Open the dialog, about the page on screen. */
export function openBugReport(): void {
  set(true);
}

export function closeBugReport(): void {
  set(false);
}

const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
};

export function useBugReportOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
