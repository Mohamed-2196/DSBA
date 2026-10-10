import {
  BookOpenText,
  Books,
  CaretDown,
  Check,
  ClipboardText,
  Exam,
  FolderSimple,
  Lightning,
  MagnifyingGlass,
  Notebook,
  NotePencil,
  PencilLine,
  Rows,
  SquaresFour,
  Star,
  UploadSimple,
  UserCircle,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { BREAKPOINTS, cohortLabel, normalizeYear, useDocumentTitle, useMediaQuery, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { Badge, Button, Chip, EmptyState, Menu, Page, PageHeader, PageSection, SearchField, SegmentedControl, Skeleton, cx, timeAgo } from '../../ui';
import { itemPath, useLibraryFacets, useLibraryList, useLibraryPages } from './api';
import { FileCard, type LinkState } from './components/FileCard';
import { FileTable } from './components/FileTable';
import { FileThumb } from './components/FileThumb';
import { UploadDialog } from './components/UploadDialog';
import { YourUploads } from './components/YourUploads';
import { addedAt, isNew, moduleTag } from './display';
import { KINDS, KIND_BY_ID, isLibraryKind, type LibraryKind } from './kinds';
import type { CohortYear, LibraryItem, LibrarySort, LibraryView } from './types';
import { useDebouncedValue } from './useDebouncedValue';
import { useStar } from './useStar';
import './LibraryPage.css';

// "New this week" already shows what's recent, so the grid opens on what people use most.
const DEFAULT_SORT: LibrarySort = 'popular';
// A search lists the best matches first, unless the student picks another order.
const SEARCH_SORT: LibrarySort = 'relevance';
const SORTS: Record<LibrarySort, string> = { relevance: 'Best match', popular: 'Most downloaded', new: 'Newest', title: 'Name, A to Z' };
// Links from before the API (?sort=downloads) keep working.
const LEGACY_SORTS: Record<string, LibrarySort> = { downloads: 'popular', newest: 'new', az: 'title' };

const KIND_ICONS: Partial<Record<LibraryKind, Icon>> = {
  'past-paper': Exam,
  'examiners-report': ClipboardText,
  'subject-guide': BookOpenText,
  reading: Books,
  'study-guide': Notebook,
  exercises: PencilLine,
  notes: NotePencil,
  'cheat-sheet': Lightning,
  'course-materials': FolderSimple,
  'vle-materials': FolderSimple,
};

type Patch = Record<string, string | null | undefined>;

/** All library filters live in the URL: ?year=&module=&type=&q=&sort=&view=&starred=1&mine=1&source=file|link */
function useLibraryParams(): [URLSearchParams, (patch: Patch) => void] {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (patch: Patch) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === '') p.delete(k);
            else p.set(k, v);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [params, update];
}

function readSort(raw: string | null, searching: boolean): LibrarySort {
  const fallback = searching ? SEARCH_SORT : DEFAULT_SORT;
  if (raw === 'relevance') return searching ? 'relevance' : DEFAULT_SORT;
  if (raw === 'new' || raw === 'popular' || raw === 'title') return raw;
  return (raw && LEGACY_SORTS[raw]) || fallback;
}

/** The shelf: files published in the last 7 days (for the year being browsed). */
function NewThisWeek({ year, yearLabel, linkState }: { year: CohortYear | null; yearLabel: string | null; linkState: LinkState }) {
  const { getModule } = useModules();
  const recent = useLibraryList({ sort: 'new', year }, { limit: 12 });
  const items = (recent.data?.items ?? []).filter((f) => isNew(f));
  if (!items.length) return null;
  return (
    <PageSection className="lib-new" aria-labelledby="lib-new-title" data-hub="library-new">
      <div className="lib-new__head">
        <h2 id="lib-new-title" className="lib-new__title">
          New this week
        </h2>
        <p className="lib-new__desc">
          {items.length === 12 ? 'The latest' : items.length} {items.length === 1 ? 'file' : 'files'} added {yearLabel ? `for ${yearLabel} ` : ''}in the last 7 days
        </p>
      </div>
      <ul className="lib-new__list" role="list">
        {items.map((f) => (
          <li key={f.id} className="lib-new__item" data-hub="file-card">
            <Link to={itemPath(f)} state={linkState} className="lib-new__link">
              <FileThumb item={f} size="strip" />
              <span className="lib-new__name">{f.title}</span>
              <span className="lib-new__meta">
                {moduleTag(getModule(f.moduleId)) ? <span className="lib-new__code">{moduleTag(getModule(f.moduleId))}</span> : null}
                <span>{timeAgo(addedAt(f))}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

function ResultsSkeleton({ view, isMobile }: { view: LibraryView; isMobile: boolean }) {
  if (view === 'list') {
    return (
      <div className="lib-table-wrap lib-skeleton-rows" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="lib-skeleton-row">
            <Skeleton width={46} height={65} radius={2} />
            <Skeleton lines={2} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="lib-grid" aria-hidden="true">
      {Array.from({ length: isMobile ? 4 : 10 }, (_, i) => (
        <div key={i} className="lib-card">
          <Skeleton className="lib-skeleton-cover" radius={4} />
          <Skeleton lines={2} />
        </div>
      ))}
    </div>
  );
}

export default function LibraryPage() {
  useDocumentTitle('Library');
  const location = useLocation();
  const { year: globalYear } = useYear();
  const { status, requireAuth, openSignIn } = useAuth();
  const { getModule, getModulesForYear } = useModules();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [params, update] = useLibraryParams();
  const toggleStar = useStar();
  const searchRef = useRef<HTMLElement>(null);
  const [upload, setUpload] = useState({ open: false, key: 0 });
  const signedIn = status === 'signed-in';

  // ── Filters from the URL ──────────────────────────────────────────
  const q = params.get('q') ?? '';
  const moduleParam = params.get('module');
  const module = moduleParam ? getModule(moduleParam) : null;
  const typeParam = params.get('type');
  const kind = isLibraryKind(typeParam) ? typeParam : null;
  const sort = readSort(params.get('sort'), !!q.trim());
  const defaultSort = q.trim() ? SEARCH_SORT : DEFAULT_SORT;
  const view: LibraryView = params.get('view') === 'list' ? 'list' : 'grid';
  const starredOnly = params.get('starred') === '1';
  const mineOnly = params.get('mine') === '1';
  const sourceParam = params.get('source');
  const source = sourceParam === 'file' || sourceParam === 'link' ? sourceParam : null;
  const yearParam = params.get('year');
  let year = (yearParam === 'all' ? null : (normalizeYear(yearParam) ?? globalYear ?? null)) as CohortYear | null;
  if (module && year && module.year !== year) year = module.year; // a module link wins over the default year
  const yearValue: 'all' | CohortYear = year == null ? 'all' : year;
  const yearLabel = year ? cohortLabel(year) : null;
  const needsAccount = starredOnly || mineOnly;

  const debouncedQ = useDebouncedValue(q, 300);
  // The request follows the settled search text, so its order changes with the results, not a keystroke earlier.
  const querySort = readSort(params.get('sort'), !!debouncedQ.trim());
  const list = useLibraryPages(
    { q: debouncedQ, moduleId: module?.id ?? null, year: mineOnly ? null : year, kind, source, sort: querySort, starred: starredOnly, mine: mineOnly },
    { enabled: !needsAccount || signedIn },
  );
  const facets = useLibraryFacets();
  const items: LibraryItem[] = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const modules = getModulesForYear(year);
  const linkState = useMemo<LinkState>(() => ({ from: `${location.pathname}${location.search}` }), [location.pathname, location.search]);

  // "/" focuses the search field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setYear = (v: 'all' | CohortYear) => {
    const y = v === 'all' ? null : v;
    const isDefault = (y ?? null) === (globalYear ?? null);
    update({ year: isDefault ? null : v === 'all' ? 'all' : String(v), module: module && y && module.year !== y ? null : moduleParam });
  };
  const anyFilter = Boolean(module || kind || q || starredOnly || mineOnly || source);
  const clearFilters = () => update({ module: null, type: null, q: null, starred: null, mine: null, source: null });
  const openUpload = () => setUpload((u) => ({ open: true, key: u.key + 1 }));

  const yearOptions = [
    { value: 'all' as const, label: isMobile ? 'All' : 'All years' },
    ...([1, 2, 3] as const).map((y) => ({
      value: y,
      label: isMobile ? `Y${y}` : `Year ${y}`,
      ariaLabel: `Year ${y}`,
      color: `var(--y${y})`,
      onColor: `var(--on-y${y})`,
    })),
  ];
  const availableKinds = KINDS.filter((k) => (facets.data?.byKind[k.id] ?? 0) > 0 || kind === k.id);

  const context = [moduleTag(module), kind ? KIND_BY_ID[kind].plural.toLowerCase() : null].filter(Boolean).join(' ');
  const yearTotal = facets.data ? (year ? (facets.data.byYear[String(year)] ?? 0) : facets.data.total) : null;

  let results;
  if (needsAccount && status === 'guest') {
    results = (
      <div className="lib-empty">
        <EmptyState
          icon={starredOnly ? Star : UserCircle}
          title={starredOnly ? 'Sign in to see your starred files' : 'Sign in to see your uploads'}
          body={starredOnly ? 'Stars are kept with your account, so they follow you to every device.' : 'Files you upload are kept with your account.'}
          action={
            <>
              <Button variant="primary" onClick={() => openSignIn({ reason: starredOnly ? 'Sign in to see your starred files' : 'Sign in to see your uploads' })}>
                Sign in
              </Button>
              <Button variant="ghost" onClick={() => update({ starred: null, mine: null })}>
                Show all files
              </Button>
            </>
          }
        />
      </div>
    );
  } else if (list.isError && !list.data) {
    results = (
      <div className="lib-empty">
        <EmptyState
          icon={WarningCircle}
          title="The library didn’t load"
          body="Check your connection, then try again."
          action={<Button onClick={() => void list.refetch()}>Try again</Button>}
        />
      </div>
    );
  } else if (list.isPending) {
    results = <ResultsSkeleton view={view} isMobile={isMobile} />;
  } else if (!items.length) {
    results = (
      <div className="lib-empty">
        {starredOnly && !q && !module && !kind ? (
          <EmptyState
            icon={Star}
            title="No starred files yet"
            body="Star the files you keep coming back to and they will wait for you here."
            action={<Button onClick={() => update({ starred: null })}>Show all files</Button>}
          />
        ) : mineOnly && !q && !module && !kind ? (
          <EmptyState
            icon={UploadSimple}
            title="You haven’t uploaded anything yet"
            body="Share your notes, a cheat sheet or a past paper with other students."
            action={
              <Button variant="primary" leadingIcon={UploadSimple} onClick={openUpload}>
                Upload a file
              </Button>
            }
          />
        ) : !anyFilter ? (
          <EmptyState
            icon={Books}
            title={`No files ${yearLabel ? `for ${yearLabel} ` : ''}yet`}
            body="Past papers, notes and guides that students share will show up here. Have something useful? Share it."
            action={
              <>
                <Button
                  variant="primary"
                  leadingIcon={UploadSimple}
                  onClick={() => {
                    if (requireAuth('Sign in to upload a file', openUpload)) openUpload();
                  }}
                >
                  Upload a file
                </Button>
                {year ? (
                  <Button variant="ghost" onClick={() => setYear('all')}>
                    See all years
                  </Button>
                ) : null}
              </>
            }
          />
        ) : (
          <EmptyState
            icon={MagnifyingGlass}
            title="No files match these filters"
            body={
              q
                ? `Nothing matches “${q}”. Check the spelling, try a module code like ST2133, or search all years.`
                : 'Try another module or type, or look at all years.'
            }
            action={
              <>
                <Button onClick={clearFilters}>Clear filters</Button>
                {year ? (
                  <Button variant="ghost" onClick={() => setYear('all')}>
                    Search all years
                  </Button>
                ) : null}
              </>
            }
          />
        )}
      </div>
    );
  } else {
    results = (
      <div className={cx('lib-results', list.isPlaceholderData && 'is-updating')} aria-busy={list.isFetching || undefined}>
        {mineOnly && items.some((f) => f.status === 'pending') ? (
          <p className="lib-review-note">
            <Badge tone="highlight" size="sm">
              Waiting for review
            </Badge>
            <span>A student rep checks every upload before it’s public. Until then only you and the reps can see it.</span>
          </p>
        ) : null}
        {view === 'grid' ? (
          <div className="lib-grid">
            {items.map((f) => (
              <FileCard key={f.id} item={f} sort={sort} onToggleStar={toggleStar} linkState={linkState} thumbSize={isMobile ? 'strip' : 'grid'} />
            ))}
          </div>
        ) : (
          <FileTable items={items} sort={sort} onSort={(id) => update({ sort: id === defaultSort ? null : id })} onToggleStar={toggleStar} linkState={linkState} />
        )}
        {list.hasNextPage ? (
          <div className="lib-more">
            <Button onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Show more
            </Button>
            <span className="lib-more__count">
              Showing {items.length} of {total}
            </span>
          </div>
        ) : null}
        {list.isError ? (
          <p className="lib-more__error" role="alert">
            Some files didn’t load. <button type="button" onClick={() => void list.refetch()}>Try again</button>
          </p>
        ) : null}
        {anyFilter ? (
          <div className={cx('lib-clear', list.hasNextPage && 'is-after-more')}>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Page width="wide" className="lib-page">
      <PageHeader
        title="Library"
        description="Past papers, study guides and students’ notes for every module. Read them here, download them, or share your own."
        actions={
          <Button
            variant="primary"
            leadingIcon={UploadSimple}
            onClick={() => {
              if (requireAuth('Sign in to upload a file', openUpload)) openUpload();
            }}
            data-hub="upload-button"
          >
            Upload a file
          </Button>
        }
        meta={
          yearTotal != null ? (
            <span className="lib-head-meta">
              <strong className="u-tabular">{yearTotal}</strong> {yearTotal === 1 ? 'file' : 'files'} {yearLabel ? `for ${yearLabel}` : 'across all years'}
            </span>
          ) : (
            <Skeleton width={140} height={18} />
          )
        }
      />

      {signedIn && !mineOnly ? <YourUploads linkState={linkState} onShowAll={() => update({ mine: '1', starred: null })} /> : null}

      {needsAccount ? null : <NewThisWeek year={year} yearLabel={yearLabel} linkState={linkState} />}

      <PageSection aria-label="Browse files" className="lib-browse">
        <div className="lib-filters" data-hub="library-filters">
          <div className="lib-filters__top">
            <SearchField
              ref={searchRef}
              className="lib-filters__search"
              value={q}
              onValueChange={(v) => update({ q: v || null })}
              placeholder="Search titles, module codes or authors"
              label="Search the library"
              shortcut={isMobile ? null : <kbd className="ui-kbd">/</kbd>}
              size="lg"
            />
            <SegmentedControl label="Year" options={yearOptions} value={yearValue} onChange={setYear} className="lib-filters__year" />
          </div>
          <div className="lib-filters__row" role="group" aria-label="Module">
            <div className="lib-filters__chips">
              <Chip selected={!module} onChange={() => update({ module: null })}>
                All modules
              </Chip>
              {modules.map((m) => (
                <Chip
                  key={m.id}
                  selected={module?.id === m.id}
                  onChange={(on) => update({ module: on ? m.id : null })}
                  color={year ? undefined : `var(--y${m.year})`}
                  title={m.name}
                >
                  {m.unitCode ? <span className="lib-chip-code">{m.unitCode}</span> : null}
                  {m.unitCode ? ` ${m.shortName}` : m.shortName}
                </Chip>
              ))}
            </div>
          </div>
          {availableKinds.length ? (
            <div className="lib-filters__row" role="group" aria-label="Type">
              <div className="lib-filters__chips">
                <Chip selected={!kind} onChange={() => update({ type: null })}>
                  All types
                </Chip>
                {availableKinds.map((k) => (
                  <Chip key={k.id} selected={kind === k.id} onChange={(on) => update({ type: on ? k.id : null })} icon={KIND_ICONS[k.id] ?? null}>
                    {k.plural}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="lib-results-bar">
          <p className="lib-count" aria-live="polite">
            {list.data ? (
              <>
                <strong className="u-tabular">{total}</strong> {total === 1 ? 'file' : 'files'}
                {mineOnly ? <span> you uploaded</span> : null}
                {starredOnly ? <span> starred</span> : null}
                {context ? <span> in {context}</span> : null}
                {q ? <span> matching “{q}”</span> : null}
                {source ? <span>{source === 'file' ? ' (files only)' : ' (links only)'}</span> : null}
              </>
            ) : (
              <span className="visually-hidden">Loading files</span>
            )}
          </p>
          <div className="lib-results-bar__tools">
            <Chip
              selected={starredOnly}
              onChange={(on) => {
                const go = () => update({ starred: on ? '1' : null, mine: null });
                if (!on || requireAuth('Sign in to see your starred files', go)) go();
              }}
              icon={<Star weight={starredOnly ? 'fill' : 'regular'} />}
            >
              Starred
            </Chip>
            {signedIn ? (
              <Chip selected={mineOnly} onChange={(on) => update({ mine: on ? '1' : null, starred: null })} icon={UploadSimple}>
                Your uploads
              </Chip>
            ) : null}
            <Menu
              align="end"
              label="Sort files"
              trigger={
                <Button variant="ghost" size="sm" trailingIcon={CaretDown} className="lib-sort">
                  <span className="lib-sort__label">Sort: </span>
                  {SORTS[sort]}
                </Button>
              }
              items={(Object.keys(SORTS) as LibrarySort[])
                .filter((id) => id !== 'relevance' || q.trim())
                .map((id) => ({
                  id,
                  label: SORTS[id],
                  icon: id === sort ? Check : <span className="lib-sort__blank" />,
                  onSelect: () => update({ sort: id === defaultSort ? null : id }),
                }))}
            />
            <SegmentedControl
              label="View"
              size="sm"
              iconOnly
              value={view}
              onChange={(v) => update({ view: v === 'grid' ? null : v })}
              options={[
                { value: 'grid' as const, label: 'Grid', icon: SquaresFour },
                { value: 'list' as const, label: 'List', icon: Rows },
              ]}
            />
          </div>
        </div>

        {results}
      </PageSection>

      <UploadDialog
        key={upload.key}
        open={upload.open}
        onClose={() => setUpload((u) => ({ ...u, open: false }))}
        defaultModuleId={module?.id ?? null}
        defaultYear={year}
      />
    </Page>
  );
}
