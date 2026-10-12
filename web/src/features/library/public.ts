// Public API of the library feature: other features import from here only.
//   <ModuleFiles moduleId />            the module page's Files tab (loaded on demand)
//   useLibraryUpload({ moduleId, year }) "Upload a file" anywhere: { start, dialog } (render `dialog`; guests sign in
//                                        first). Decision D6: contributing means uploading to the library.
//   useRecentFiles({ n, year })         newest published items: { data: LibraryItem[] | undefined, isPending, isError, refetch }
//   <UploadsQueue />                    moderators' review queue (the /moderation page)
//   libraryItemPath(item)               '/library/<slug>', the item's page
//   libraryKindLabel(kind)              'Past paper', 'Students’ notes', …
import { createElement, lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { useAuth } from '../../auth';
import type { CohortYear } from '../../state';
import { Skeleton } from '../../ui';

export { useRecentFiles } from './api';
export { itemPath as libraryItemPath } from './api';
export { kindLabel as libraryKindLabel } from './kinds';
export { UploadsQueue } from './UploadsQueue';
export type { LibraryItem } from './types';

const LazyModuleFiles = lazy(() => import('./ModuleFiles'));
const LazyUploadDialog = lazy(() => import('./components/UploadDialog').then((m) => ({ default: m.UploadDialog })));

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

/**
 * The library's upload dialog, opened from another feature (a module page): `start()` asks a guest to sign in
 * first, then opens it with the module chosen; render `dialog` once anywhere in the page. The dialog's code loads
 * the first time it opens.
 */
export function useLibraryUpload({ moduleId = null, year = null }: { moduleId?: string | null; year?: CohortYear | null } = {}): {
  start: () => void;
  dialog: ReactNode;
} {
  const { requireAuth } = useAuth();
  const [state, setState] = useState({ open: false, key: 0 });
  const open = useCallback(() => setState((s) => ({ open: true, key: s.key + 1 })), []);
  const start = useCallback(() => {
    if (requireAuth('Sign in to upload a file', open)) open();
  }, [requireAuth, open]);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const dialog =
    state.key > 0
      ? createElement(
          Suspense,
          { fallback: null },
          createElement(LazyUploadDialog, { key: state.key, open: state.open, onClose: close, defaultModuleId: moduleId, defaultYear: year }),
        )
      : null;
  return { start, dialog };
}
