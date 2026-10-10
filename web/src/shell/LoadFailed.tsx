// Shown when the app cannot load what every page needs (the module catalogue): usually no connection.
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="load-failed" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>The Hub can&apos;t reach its server</h1>
        <p style={{ color: 'var(--ink-2)', marginBottom: 16 }}>Check your connection, then try again.</p>
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </main>
  );
}
