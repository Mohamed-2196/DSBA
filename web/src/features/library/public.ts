// Public API of the library feature: other features import from here only.
//   <ModuleFiles moduleId />            the module page's Files tab (loaded on demand)
//   useRecentFiles({ n, year })         newest published items: { data: LibraryItem[] | undefined, isPending, isError, refetch }
//   <UploadsQueue />                    moderators' review queue (the /moderation page)
//   libraryItemPath(item)               '/library/<slug>', the item's page
//   libraryKindLabel(kind)              'Past paper', 'Students’ notes', …
import { createElement, lazy, Suspense } from 'react';
import { Skeleton } from '../../ui';

export { useRecentFiles } from './api';
export { itemPath as libraryItemPath } from './api';
export { kindLabel as libraryKindLabel } from './kinds';
export { UploadsQueue } from './UploadsQueue';
export type { LibraryItem } from './types';

const LazyModuleFiles = lazy(() => import('./ModuleFiles'));

/** The module page's Files tab: the module's files grouped by type, with Upload. */
export function ModuleFiles({ moduleId }: { moduleId: string }) {
  return createElement(
    Suspense,
    {
      fallback: createElement(
        'div',
        { style: { display: 'grid', gap: 12 } },
        createElement(Skeleton, { height: 24, width: 260 }),
        createElement(Skeleton, { height: 160, radius: 16 }),
      ),
    },
    createElement(LazyModuleFiles, { moduleId }),
  );
}
