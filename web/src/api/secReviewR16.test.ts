// Security review, round 16: what the offline snapshot shows on a shared computer once the session is gone.
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { startOfflineCache, type OfflineCache, type SnapshotStore } from './offline';
import { entryFor, type OfflineSnapshot } from './offlineCache';

let running: OfflineCache | null = null;
afterEach(() => {
  running?.stop();
  running = null;
  onlineManager.setOnline(true);
});

const now = Date.now();
const entry = (key: unknown[], data: unknown) => entryFor(JSON.stringify(key), key, data, now - 60_000)!;

describe('offline snapshot after the session ended elsewhere', () => {
  it("shows the last account's own events and its anonymous questions to whoever opens the browser offline", async () => {
    // What student A's browser kept: A then signed out "everywhere" from a phone, so this browser's cookie is dead,
    // but the snapshot is only dropped when the app next hears GET /auth/session online.
    const kept: OfflineSnapshot = {
      v: 1,
      owner: 'student-a',
      entries: [
        entry(['me'], { id: 'student-a', displayName: 'A', email: null, phone: null }),
        entry(['calendar', 'mine', 'events'], [{ id: 'e1', title: 'Clinic appointment' }]),
        entry(['forum', 'list', { yours: true }, 20], {
          pages: [[{ title: 'My anonymous question', anonymous: true }]],
        }),
      ],
    };
    const store: SnapshotStore = {
      read: () => Promise.resolve(kept),
      write: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };

    // The next person opens the hub with the network off (DevTools "Offline" is enough).
    onlineManager.setOnline(false);
    const qc = new QueryClient();
    running = await startOfflineCache(qc, store, { delay: 60_000, now: () => now });
    qc.getQueryCache().build(qc, { queryKey: ['me'] });
    qc.getQueryCache().build(qc, { queryKey: ['calendar', 'mine', 'events'] });
    qc.getQueryCache().build(qc, { queryKey: ['forum', 'list', { yours: true }, 20] });

    expect(qc.getQueryData(['me'])).toMatchObject({ id: 'student-a' });
    expect(qc.getQueryData(['calendar', 'mine', 'events'])).toEqual([{ id: 'e1', title: 'Clinic appointment' }]);
    expect(qc.getQueryData(['forum', 'list', { yours: true }, 20])).toMatchObject({
      pages: [[{ anonymous: true }]],
    });
  });
});
