import { PulseMark } from '../ui';

/** Suspense fallback for lazy pages: the pulse trace as a loader. */
export function PageLoader() {
  return (
    <div className="shell-loader" role="status">
      <PulseMark size={22} animate="loop" />
      <span className="visually-hidden">Loading page</span>
    </div>
  );
}
