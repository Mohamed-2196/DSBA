// Public API of the library feature (agent B). Signatures are a contract — do not change them.
// File: { id, moduleId, year, kind, title, format, pages, sizeKB, author, addedAt (ISO), sourceUrl, isNew }
// Files also carry extras other features may use: url ('/library/<id>', the in-app viewer route),
// fileName, ext, kindLabel, moduleCode, moduleName, examYear, zone, downloads, favourite (a student favourite) and
// image ({ src, width, height, alt } for a real document: format 'PNG', one page, the picture is the page; else null).
//
// The data functions only load the lightweight catalog; ModuleFiles (which renders document
// thumbnails) is loaded on demand so importing this file stays cheap.
import { createElement, lazy, Suspense } from 'react';
import { Skeleton } from '../../ui';
import { getFilesForModule as filesForModule, getRecentFiles as recentFiles } from './data/catalog';
import { searchFiles as search } from './data/search';

const LazyModuleFiles = lazy(() => import('./ModuleFiles'));

/** Component for the module page Files tab: the module's files grouped by kind, with "Open original". */
export function ModuleFiles({ moduleId }) {
  return createElement(
    Suspense,
    { fallback: createElement('div', { style: { display: 'grid', gap: 12 } }, createElement(Skeleton, { height: 140, radius: 16 }), createElement(Skeleton, { lines: 3 })) },
    createElement(LazyModuleFiles, { moduleId }),
  );
}

/** -> File[] (every file for the module, newest first; accepts a v1 code too). */
export function getFilesForModule(moduleId) {
  return filesForModule(moduleId);
}

/** -> File[] newest first (optionally one cohort year). */
export function getRecentFiles(n = 6, { year } = {}) {
  return recentFiles(n, { year });
}

/** -> File[] best match first. Matches titles, module codes and names, kinds, authors, years and zones. */
export function searchFiles(query) {
  return search(query);
}
