import { Page, Skeleton } from '../ui';

/**
 * Suspense fallback for lazy pages: the shape of a page (a title, a line, a few panels) inside the shell, which is
 * already on screen, so a slow first load shows where things will be rather than a spinner on an empty page (UX-77).
 * It fades in after a moment, so a fast load never flashes it.
 */
export function PageLoader() {
  return (
    <Page className="shell-loader" aria-busy="true">
      <span className="visually-hidden" role="status">
        Loading page
      </span>
      <div className="shell-loader__head" aria-hidden="true">
        <Skeleton width="min(320px, 70%)" height={32} radius={8} />
        <Skeleton width="min(520px, 90%)" height={14} />
      </div>
      <div className="shell-loader__grid" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={200} radius={16} />
        ))}
      </div>
    </Page>
  );
}
