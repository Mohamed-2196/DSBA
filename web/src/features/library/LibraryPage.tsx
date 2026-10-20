import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { showsUpload, useAuth } from '../../auth';
import {
  BREAKPOINTS,
  cohortLabel,
  normalizeYear,
  useDebouncedValue,
  useDocumentTitle,
  useMediaQuery,
  useYear,
} from '../../state';
import { useModules } from '../../state/modules';
import {
  Badge,
  Button,
  Chip,
  Count,
  DocThumb,
  EmptyState,
  Icon,
  IconButton,
  Kbd,
  Menu,
  Page,
  Deskmate,
  PageHeader,
  PageSection,
  QueryError,
  SearchField,
  SegmentedControl,
  Skeleton,
  cx,
  formatCount,
  glyph,
  timeAgo,
} from '../../ui';
import { itemPath, useLibraryFacets, useLibraryList, useLibraryPages } from './api';
import { FileGrid, type LinkState } from './components/FileCard';
import { FileRows } from './components/FileRow';
import { FileThumb } from './components/FileThumb';
import { FilterSheet } from './components/FilterSheet';
import { PaperSittings } from './components/PaperSittings';
import { useCoverStyle } from './components/coverStyle';
import { AddLinkDialog } from './components/AddLinkDialog';
import { UploadDialog } from './components/UploadDialog';
import { YourUploads } from './components/YourUploads';
import { addedAt, examTitle, hasExamTitle, isNew, moduleTag } from './display';
import {
  CLEAR_ALL,
  DEFAULT_VIEW,
  activeFilters,
  defaultSort,
  readSort,
  sittingSortOffered,
  type Patch,
} from './filters';
import { KINDS, KIND_BY_ID, docTone, isLibraryKind } from './kinds';
import type { CohortYear, LibraryItem, LibrarySort, LibraryView } from './types';
import { useStar } from './useStar';
import { AskLink } from '../requests/public';
import './LibraryPage.css';

/** Phones, upright or on their side, and touch tablets: search, Filters and Sort in place of the filter panel, so
 *  files come first. */
const COMPACT =
  '(max-width: 699px), (pointer: coarse) and (max-width: 1099px), (pointer: coarse) and (max-height: 500px)';

const SORTS: Record<LibrarySort, string> = {
  relevance: 'Best match',
  sitting: 'Newest sitting',
  popular: 'Most downloaded',
  new: 'Newest',
  title: 'Name, A to Z',
};

/** All library filters live in the URL: ?year=&module=&type=&q=&sort=&view=&starred=1&mine=1&source=file|link.
 *  ?upload=1 opens the upload dialog (the shell's "Upload a file", decision D6), and is then taken out of the URL. */
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

/** Files students shared in the last 7 days (for the year browsed), the newest 12. */
function useNewThisWeek(year: CohortYear | null): LibraryItem[] {
  const recent = useLibraryList({ sort: 'new', year }, { limit: 12 });
  return (recent.data?.items ?? []).filter((f) => isNew(f));
}

/** The shelf: files published in the last 7 days (for the year being browsed). */
function NewThisWeek({
  year,
  yearLabel,
  linkState,
}: {
  year: CohortYear | null;
  yearLabel: string | null;
  linkState: LinkState;
}) {
  const { getModule } = useModules();
  const items = useNewThisWeek(year);
  if (!items.length) return null;
  return (
    <PageSection className="lib-new" aria-labelledby="lib-new-title" data-hub="library-new">
      <div className="lib-new__head">
        <h2 id="lib-new-title" className="lib-new__title">
          New this week
        </h2>
        <p className="lib-new__desc">
          {items.length === 12 ? 'The latest' : items.length} {items.length === 1 ? 'file' : 'files'} added{' '}
          {yearLabel ? `for ${yearLabel} ` : ''}in the last 7 days
        </p>
      </div>
      <ul className="lib-new__list" role="list">
        {items.map((f) => {
          const code = moduleTag(getModule(f.moduleId));
          return (
            <li key={f.id} className="lib-new__item" data-hub="file-card">
              <Link to={itemPath(f)} state={linkState} className="lib-new__link">
                <FileThumb item={f} size="strip" />
                <span className="lib-new__name">{examTitle(f, code)}</span>
                <span className="lib-new__meta">
                  {code && !hasExamTitle(f) ? <span className="lib-new__code u-code">{code}</span> : null}
                  <span>{timeAgo(addedAt(f))}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}

function ResultsSkeleton({ view, isMobile }: { view: LibraryView; isMobile: boolean }) {
  if (view === 'list') {
    return (
      <div className="lib-ixs" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="lib-ix">
            <Skeleton width={48} height={62} radius={4} />
            <div className="lib-ix__main">
              <Skeleton lines={2} />
            </div>
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
  const { status, requireAuth, openSignIn, featureOn, mayTry, can } = useAuth();
  // Upload shows while the library takes uploads and the person may try (guests sign in first).
  const uploadShown = showsUpload(featureOn, mayTry);
  // Library managers also add links to resources kept on other sites.
  const linksShown = can('library.manage');
  const [linking, setLinking] = useState({ open: false, key: 0 });
  const { getModule, getModulesForYear } = useModules();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const compact = useMediaQuery(COMPACT);
  const [params, update] = useLibraryParams();
  const [coverStyle, setCoverStyle] = useCoverStyle();
  const toggleStar = useStar();
  const searchRef = useRef<HTMLElement>(null);
  const [upload, setUpload] = useState({ open: false, key: 0 });
  const [sheetOpen, setSheetOpen] = useState(false);
  const signedIn = status === 'signed-in';
  const board = featureOn('board');

  // ── Filters from the URL ──────────────────────────────────────────
  const q = params.get('q') ?? '';
  const moduleParam = params.get('module');
  const module = moduleParam ? getModule(moduleParam) : null;
  const typeParam = params.get('type');
  const kind = isLibraryKind(typeParam) ? typeParam : null;
  const sort = readSort(params.get('sort'), { searching: !!q.trim(), kind, module: !!module });
  const openingSort = defaultSort(!!q.trim(), kind);
  const viewParam = params.get('view');
  const openingView = DEFAULT_VIEW;
  const view: LibraryView = viewParam === 'list' || viewParam === 'grid' ? viewParam : openingView;
  const starredOnly = params.get('starred') === '1';
  const mineOnly = params.get('mine') === '1';
  const sourceParam = params.get('source');
  const source = sourceParam === 'file' || sourceParam === 'link' ? sourceParam : null;
  // Starred files and your uploads are your own lists: they show every year unless one is picked (student test ST-1).
  const needsAccount = starredOnly || mineOnly;
  const defaultYear: CohortYear | null = needsAccount ? null : (globalYear ?? null);
  const yearParam = params.get('year');
  let year: CohortYear | null = yearParam === 'all' ? null : (normalizeYear(yearParam) ?? defaultYear);
  if (module && year && module.year !== year) year = module.year; // a module link wins over the default year
  const yearValue: 'all' | CohortYear = year == null ? 'all' : year;
  const yearLabel = year ? cohortLabel(year) : null;
  const uploadParam = params.get('upload') === '1';

  const newOnes = useNewThisWeek(year);
  const newLine = `${newOnes.length === 12 ? '12+' : newOnes.length} new this week`;
  const debouncedQ = useDebouncedValue(q, 300);
  // The request follows the settled search text, so its order changes with the results, not a keystroke earlier.
  const querySort = readSort(params.get('sort'), { searching: !!debouncedQ.trim(), kind, module: !!module });
  const list = useLibraryPages(
    {
      q: debouncedQ,
      moduleId: module?.id ?? null,
      year,
      kind,
      source,
      sort: querySort,
      starred: starredOnly,
      mine: mineOnly,
    },
    { enabled: !needsAccount || signedIn },
  );
  const facets = useLibraryFacets();
  const items: LibraryItem[] = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const modules = getModulesForYear(year);
  const linkState = useMemo<LinkState>(
    () => ({ from: `${location.pathname}${location.search}` }),
    [location.pathname, location.search],
  );

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
    const isDefault = y === defaultYear;
    update({
      year: isDefault ? null : v === 'all' ? 'all' : String(v),
      module: module && y && module.year !== y ? null : moduleParam,
    });
  };
  const anyFilter = Boolean(module || kind || q || starredOnly || mineOnly || source);
  // One module's past papers show as its sittings table, as on the module's Files tab.
  const sittingsView = !!module && kind === 'past-paper' && !q.trim() && !needsAccount && !source;
  const active = activeFilters({
    year,
    defaultYear,
    module: moduleTag(module),
    kind,
    starred: starredOnly,
    mine: mineOnly,
    source,
  });
  const onSort = (id: LibrarySort) => update({ sort: id === openingSort ? null : id });
  // Past papers kept on other sites, beside the sittings (which hold the Hub's own files only).
  const paperLinks = useLibraryList(
    { moduleId: module?.id ?? null, kind: 'past-paper', source: 'link', sort: 'title' },
    { limit: 50, enabled: sittingsView },
  );
  const clearFilters = () => update({ module: null, type: null, q: null, starred: null, mine: null, source: null });
  const openUpload = useCallback(() => setUpload((u) => ({ open: true, key: u.key + 1 })), []);
  const startUpload = () => {
    if (requireAuth('Sign in to upload a file', openUpload)) openUpload();
  };

  // ?upload=1 (from the shell, also while this page is open): sign in first if needed, then the dialog. Once per
  // navigation, and only once it is known who is signed in.
  const handledUpload = useRef<string | null>(null);
  useEffect(() => {
    if (!uploadParam || status === 'loading' || handledUpload.current === location.key) return;
    handledUpload.current = location.key;
    update({ upload: null });
    if (!uploadShown) return;
    if (requireAuth('Sign in to upload a file', openUpload)) openUpload();
  }, [uploadParam, status, location.key, requireAuth, update, openUpload, uploadShown]);

  const toggleStarred = (on: boolean) => {
    const go = () => update({ starred: on ? '1' : null, mine: null });
    if (!on || requireAuth('Sign in to see your starred files', go)) go();
  };
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
          icon={<Icon glyph={starredOnly ? glyph.star : glyph.user} />}
          title={starredOnly ? 'Sign in to see your starred files' : 'Sign in to see your uploads'}
          body={
            starredOnly
              ? 'Stars are kept with your account, so they follow you to every device.'
              : 'Files you upload are kept with your account.'
          }
          action={
            <>
              <Button
                variant="primary"
                onClick={() =>
                  openSignIn({
                    reason: starredOnly ? 'Sign in to see your starred files' : 'Sign in to see your uploads',
                  })
                }
              >
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
      <QueryError
        error={list.error}
        title="The library didn’t load"
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  } else if (list.isPending) {
    results = <ResultsSkeleton view={view} isMobile={isMobile} />;
  } else if (!items.length) {
    results = (
      <div className="lib-empty">
        {starredOnly && !q && !module && !kind && !source ? (
          year ? (
            // A year was picked on purpose: the other years may hold starred files.
            <EmptyState
              mate="stacks"
              title={`No starred files for ${yearLabel}`}
              body="Files you starred for other years are under All years."
              action={<Button onClick={() => setYear('all')}>See all years</Button>}
            />
          ) : (
            <EmptyState
              mate="stacks"
              title="No starred files yet"
              body="Star the files you keep coming back to and they will wait for you here."
              action={<Button onClick={() => update({ starred: null })}>Show all files</Button>}
            />
          )
        ) : mineOnly && !q && !module && !kind && !source ? (
          year ? (
            <EmptyState
              mate="stacks"
              title={`No uploads for ${yearLabel}`}
              body="Files you uploaded for other years are under All years."
              action={<Button onClick={() => setYear('all')}>See all years</Button>}
            />
          ) : (
            <EmptyState
              mate="stacks"
              title="You haven’t uploaded anything yet"
              body="Share your notes, a cheat sheet or a past paper with other students."
              action={
                uploadShown ? (
                  <Button variant="primary" leadingIcon={<Icon glyph={glyph.upload} />} onClick={startUpload}>
                    Upload a file
                  </Button>
                ) : undefined
              }
            />
          )
        ) : !anyFilter ? (
          <EmptyState
            mate="stacks"
            title={`No files ${yearLabel ? `for ${yearLabel} ` : ''}yet`}
            body="Past papers, notes and guides that students share will show up here. Have something useful? Share it."
            action={
              <>
                {uploadShown ? (
                  <Button variant="primary" leadingIcon={<Icon glyph={glyph.upload} />} onClick={startUpload}>
                    Upload a file
                  </Button>
                ) : null}
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
            mate="stacks"
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
          >
            <AskLink />
          </EmptyState>
        )}
      </div>
    );
  } else if (sittingsView && module) {
    results = (
      <div className="lib-results lib-results--sittings" data-hub="library-sittings">
        <PaperSittings
          moduleId={module.id}
          linkState={linkState}
          board={board}
          headingLevel={2}
          renderOther={(other) => (
            <FileRows items={other} sort={sort} onToggleStar={toggleStar} linkState={linkState} />
          )}
        />
        {paperLinks.data?.items.length ? (
          <section className="lib-mf__group" aria-labelledby="lib-paper-links">
            <h2 id="lib-paper-links" className="lib-mf__h">
              Links
              <span className="lib-mf__count">{paperLinks.data.items.length}</span>
            </h2>
            <FileRows items={paperLinks.data.items} sort={sort} onToggleStar={toggleStar} linkState={linkState} />
          </section>
        ) : null}
      </div>
    );
  } else {
    results = (
      <div
        className={cx('lib-results', list.isPlaceholderData && 'is-updating')}
        aria-busy={list.isFetching || undefined}
      >
        {mineOnly && items.some((f) => f.status === 'pending') ? (
          <p className="lib-review-note">
            <Badge tone="highlight" size="sm">
              Waiting for review
            </Badge>
            <span>
              A student rep checks every upload before it’s public. Until then only you and the reps can see it.
            </span>
          </p>
        ) : null}
        {view === 'grid' ? (
          <FileGrid
            items={items}
            sort={sort}
            onToggleStar={toggleStar}
            linkState={linkState}
            thumbSize={isMobile ? 'strip' : 'grid'}
          />
        ) : (
          <FileRows items={items} sort={sort} onToggleStar={toggleStar} linkState={linkState} />
        )}
        {list.hasNextPage ? (
          <div className="lib-more">
            <Button onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Show more
            </Button>
            <span className="lib-more__count">
              Showing <Count value={items.length} /> of <Count value={total} />
            </span>
          </div>
        ) : null}
        {list.isError ? (
          <p className="lib-more__error" role="alert">
            Some files didn’t load.{' '}
            <button type="button" onClick={() => void list.refetch()}>
              Try again
            </button>
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

  const countLine = list.data ? (
    <>
      <strong className="u-tabular">{formatCount(total)}</strong> {total === 1 ? 'file' : 'files'}
      {mineOnly ? <span> you uploaded</span> : null}
      {starredOnly ? <span> starred</span> : null}
      {context ? <span> in {context}</span> : null}
      {q ? <span> matching “{q}”</span> : null}
      {source ? <span>{source === 'file' ? ' (files only)' : ' (links only)'}</span> : null}
    </>
  ) : (
    <span className="visually-hidden">Loading files</span>
  );
  const sortMenu = sittingsView ? null : (
    <Menu
      align="end"
      label="Sort files"
      trigger={
        compact ? (
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<Icon glyph={glyph.sort} />}
            className="lib-sort lib-sort--icon"
            aria-label={`Sort files: ${SORTS[sort]}`}
            title={`Sort: ${SORTS[sort]}`}
          />
        ) : (
          <Button variant="ghost" size="sm" trailingIcon={<Icon glyph={glyph.chevronDown} />} className="lib-sort">
            <span className="lib-sort__label">Sort: </span>
            {SORTS[sort]}
          </Button>
        )
      }
      items={(Object.keys(SORTS) as LibrarySort[])
        .filter((id) => (id !== 'relevance' || q.trim()) && (id !== 'sitting' || sittingSortOffered(kind, !!module)))
        .map((id) => ({
          id,
          label: SORTS[id],
          icon: id === sort ? <Icon glyph={glyph.check} /> : <span className="lib-sort__blank" />,
          onSelect: () => onSort(id),
        }))}
    />
  );
  const viewToggle = sittingsView ? null : (
    <SegmentedControl
      label="View"
      size="sm"
      iconOnly
      value={view}
      onChange={(v) => update({ view: v === openingView ? null : v })}
      options={[
        { value: 'grid' as const, label: 'Grid', icon: glyph.gridView },
        { value: 'list' as const, label: 'List', icon: glyph.rows },
      ]}
    />
  );
  const search = (
    <SearchField
      ref={searchRef}
      className="lib-filters__search"
      value={q}
      onValueChange={(v) => update({ q: v || null })}
      placeholder="Search files"
      label="Search the library"
      shortcut={compact ? null : <Kbd>/</Kbd>}
      size="lg"
    />
  );
  const openLinking = () => setLinking((l) => ({ open: true, key: l.key + 1 }));
  // Your uploads and New this week lead the page on wider screens; on a phone the files come first. New this week
  // makes way once the student filters or searches.
  const extras = (
    <>
      {signedIn && !mineOnly ? (
        <YourUploads linkState={linkState} onShowAll={() => update({ mine: '1', starred: null })} />
      ) : null}
      {needsAccount || anyFilter ? null : <NewThisWeek year={year} yearLabel={yearLabel} linkState={linkState} />}
    </>
  );

  return (
    <Page width="wide" className="lib-page" data-section="library">
      {compact ? (
        <header className="lib-mhead">
          <div className="lib-mhead__text">
            <h1 className="lib-mhead__title">Library</h1>
            <p className="lib-mhead__meta">
              {yearTotal != null ? (
                <span>
                  <span className="u-tabular">{formatCount(yearTotal)}</span> {yearTotal === 1 ? 'file' : 'files'}
                  {yearLabel ? ` for ${yearLabel}` : ''}
                </span>
              ) : (
                <Skeleton width={120} height={14} />
              )}
              {newOnes.length ? <span className="lib-mhead__new">{newLine}</span> : null}
            </p>
          </div>
          {linksShown ? (
            <IconButton
              label="Add a link"
              icon={<Icon glyph={glyph.link} />}
              onClick={openLinking}
              data-hub="link-button"
            />
          ) : null}
          {uploadShown ? (
            <IconButton
              label="Upload a file"
              icon={<Icon glyph={glyph.upload} />}
              variant="primary"
              onClick={startUpload}
              data-hub="upload-button"
            />
          ) : null}
          <Deskmate mate="stacks" size={64} className="lib-mhead__mate" />
        </header>
      ) : (
        <PageHeader
          section="library"
          title="Library"
          description="Past papers, study guides and students’ notes for every module. Read them here, download them, or share your own."
          actions={
            uploadShown || linksShown ? (
              <>
                {linksShown ? (
                  <Button leadingIcon={<Icon glyph={glyph.link} />} onClick={openLinking} data-hub="link-button">
                    Add a link
                  </Button>
                ) : null}
                {uploadShown ? (
                  <Button
                    variant="primary"
                    leadingIcon={<Icon glyph={glyph.upload} />}
                    onClick={startUpload}
                    data-hub="upload-button"
                  >
                    Upload a file
                  </Button>
                ) : null}
              </>
            ) : undefined
          }
          meta={
            yearTotal != null ? (
              <>
                <span className="lib-head-meta">
                  <strong className="u-tabular">{formatCount(yearTotal)}</strong> {yearTotal === 1 ? 'file' : 'files'}{' '}
                  {yearLabel ? `for ${yearLabel}` : 'across all years'}
                </span>
                {newOnes.length ? <span className="lib-head-meta lib-head-meta--new">{newLine}</span> : null}
              </>
            ) : (
              <Skeleton width={140} height={18} />
            )
          }
        />
      )}

      {compact ? null : extras}

      <PageSection aria-label="Browse files" className="lib-browse">
        {compact ? (
          <div className="lib-filters lib-filters--compact" data-hub="library-filters">
            {search}
            <div className="lib-filters__bar">
              {/* Filters, then each filter that is on as a chip that takes it off: one strip that scrolls inside
                  itself. Sort stays at the end of the row. */}
              <ul className="lib-filters__active u-scroll-row" aria-label="Filters">
                <li>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    aria-haspopup="dialog"
                    aria-label={active.length ? `Filters, ${active.length} on` : 'Filters'}
                    className="lib-filters__open"
                    data-hub="library-filters-open"
                  >
                    <Icon glyph={glyph.filter} className="lib-filters__icon" />
                    Filters
                    {active.length ? <span className="lib-filters__n">{active.length}</span> : null}
                  </button>
                </li>
                {active.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="lib-active"
                      onClick={() => update(f.patch)}
                      aria-label={`Remove the filter ${f.label}`}
                    >
                      {f.label}
                      <Icon glyph={glyph.close} />
                    </button>
                  </li>
                ))}
              </ul>
              {sortMenu}
            </div>
            <p className="lib-context" aria-live="polite">
              <span className="lib-context__what">
                {module ? (
                  <>
                    {module.unitCode ? <span className="u-code">{module.unitCode}</span> : null} {module.name}
                  </>
                ) : (
                  (yearLabel ?? 'All years')
                )}
              </span>
              {list.data ? (
                <span className="lib-context__n u-tabular">
                  {formatCount(total)} {total === 1 ? 'file' : 'files'}
                </span>
              ) : null}
            </p>
          </div>
        ) : (
          <>
            <div className="lib-filters" data-hub="library-filters">
              <div className="lib-filters__top">
                {search}
                <SegmentedControl
                  label="Year"
                  options={yearOptions}
                  value={yearValue}
                  onChange={setYear}
                  className="lib-filters__year"
                />
              </div>
              <div className="lib-filters__row" role="group" aria-label="Module">
                <div className="lib-filters__chips u-scroll-row">
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
                  <div className="lib-filters__chips u-scroll-row">
                    <Chip selected={!kind} onChange={() => update({ type: null })}>
                      All types
                    </Chip>
                    {availableKinds.map((k) => (
                      <Chip
                        key={k.id}
                        selected={kind === k.id}
                        onChange={(on) => update({ type: on ? k.id : null })}
                        icon={<DocThumb tone={docTone({ kind: k.id, source: 'file' })} size="sm" />}
                      >
                        {k.plural}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="lib-results-bar">
              <p className="lib-count" aria-live="polite">
                {countLine}
              </p>
              <div className="lib-results-bar__tools">
                <Chip
                  selected={starredOnly}
                  onChange={toggleStarred}
                  icon={<Icon glyph={glyph.star} active={starredOnly} />}
                >
                  Starred
                </Chip>
                {signedIn ? (
                  <Chip
                    selected={mineOnly}
                    onChange={(on) => update({ mine: on ? '1' : null, starred: null })}
                    icon={<Icon glyph={glyph.upload} />}
                  >
                    Your uploads
                  </Chip>
                ) : null}
                {sittingsView || view !== 'grid' ? null : (
                  <Chip
                    selected={coverStyle === 'styled'}
                    onChange={(on) => setCoverStyle(on ? 'styled' : 'original')}
                    icon={<Icon glyph={glyph.swatches} />}
                    title="Switch between original file covers and generated title covers"
                  >
                    Styled covers
                  </Chip>
                )}
                {sortMenu}
                {viewToggle}
              </div>
            </div>
          </>
        )}

        {results}
        {items.length ? <AskLink lead="Missing a paper or notes?" /> : null}
      </PageSection>

      {compact ? extras : null}

      {compact ? (
        <FilterSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          year={year}
          onYear={setYear}
          modules={modules}
          moduleId={module?.id ?? null}
          onModule={(id) => update({ module: id })}
          kinds={availableKinds}
          kind={kind}
          onKind={(k) => update({ type: k })}
          starred={starredOnly}
          onStarred={toggleStarred}
          mine={signedIn ? mineOnly : null}
          onMine={(on) => update({ mine: on ? '1' : null, starred: null })}
          view={sittingsView ? null : view}
          onView={(v) => update({ view: v === openingView ? null : v })}
          styledCovers={coverStyle === 'styled'}
          onStyledCovers={(on) => setCoverStyle(on ? 'styled' : 'original')}
          total={list.data ? total : null}
          activeCount={active.length}
          onClearAll={() => update(CLEAR_ALL)}
        />
      ) : null}

      {uploadShown ? (
        <UploadDialog
          key={`upload-${upload.key}`}
          open={upload.open}
          onClose={() => setUpload((u) => ({ ...u, open: false }))}
          defaultModuleId={module?.id ?? null}
          defaultYear={year}
        />
      ) : null}
      {linksShown ? (
        <AddLinkDialog
          key={`link-${linking.key}`}
          open={linking.open}
          onClose={() => setLinking((l) => ({ ...l, open: false }))}
          moduleId={module?.id ?? null}
          year={year}
        />
      ) : null}
    </Page>
  );
}
