import { HubMark } from '../ui';

/** Suspense fallback for lazy pages: the trace as a loader. */
export function PageLoader() {
  return (
    <div className="shell-loader" role="status">
      <HubMark size={22} animate="loop" />
      <span className="visually-hidden">Loading page</span>
    </div>
  );
}
