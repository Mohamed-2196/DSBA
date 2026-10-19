// The quiet line under the top bar while there is no connection: what the page shows (what was kept from the last
// visit, api/offline.ts) and that changes wait for the connection. Nothing when online.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { CloudSlash } from '@phosphor-icons/react';
import { useCallback, useSyncExternalStore } from 'react';
import { offlineScope } from '../api/offlineCache';
import { useOnline } from '../state';
import './OfflineBar.css';

/** A screen is waiting for something that is kept for offline reading, but wasn't kept this time. */
function waitingForUnkept(qc: QueryClient): boolean {
  return qc
    .getQueryCache()
    .getAll()
    .some(
      (q) =>
        q.state.data === undefined &&
        q.state.fetchStatus === 'paused' &&
        q.getObserversCount() > 0 &&
        offlineScope(q.queryKey) !== null,
    );
}

export function OfflineBar() {
  const online = useOnline();
  const qc = useQueryClient();
  const subscribe = useCallback((listener: () => void) => qc.getQueryCache().subscribe(listener), [qc]);
  const waiting = useSyncExternalStore(
    subscribe,
    () => !online && waitingForUnkept(qc),
    () => false,
  );
  if (online) return null;
  return (
    <div className="shell-offline" role="status" data-hub="offline-bar">
      <p className="shell-offline__line">
        <CloudSlash size={16} weight="bold" aria-hidden className="shell-offline__icon" />
        <span className="shell-offline__text">
          <strong>Offline</strong> ·{' '}
          {waiting
            ? 'some of what’s here wasn’t kept from your last visit. It loads once you’re back online.'
            : 'showing what you last saw. Posting and saving need a connection.'}
        </span>
      </p>
    </div>
  );
}
