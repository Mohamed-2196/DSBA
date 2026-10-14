import { Spinner } from '../ui';

/** Suspense fallback for lazy pages. */
export function PageLoader() {
  return (
    <div className="shell-loader" role="status">
      <Spinner size={24} />
      <span className="visually-hidden">Loading page</span>
    </div>
  );
}
