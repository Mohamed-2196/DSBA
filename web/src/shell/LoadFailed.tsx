import { ArrowClockwise, WifiSlash } from '@phosphor-icons/react';
import { Button, EmptyState } from '../ui';

// Shown when the app cannot load what every page needs (the module catalogue): usually no connection.
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="load-failed" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <EmptyState
        icon={WifiSlash}
        title="The Hub can’t reach its server"
        body="Check your connection, then try again."
        action={
          <Button variant="primary" leadingIcon={ArrowClockwise} onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </main>
  );
}
