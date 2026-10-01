import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  BookOpenText, Books, CaretDown, Check, ClipboardText, Exam, Lightning, MagnifyingGlass, Notebook, NotePencil,
  PencilLine, Rows, SquaresFour, Star, UploadSimple,
} from '@phosphor-icons/react';
import {
  Badge, Button, Chip, EmptyState, Menu, Page, PageHeader, PageSection, SearchField, SegmentedControl, cx, timeAgo,
} from '../../ui';
import { BREAKPOINTS, cohortLabel, normalizeYear, useDocumentTitle, useMediaQuery, useYear } from '../../state';
import { getModule, getModulesForYear } from '../../data/modules.js';
import { getNewFiles, SORTS } from './data/catalog.js';
import { facetCounts, filterFiles } from './data/search.js';
import { KINDS, KIND_BY_ID } from './data/kinds.js';
import { moduleTag } from './data/display.js';
import { useStarred } from './data/useStarred.js';
import { FileCard } from './components/FileCard.jsx';
import { FileTable } from './components/FileTable.jsx';
import { FileThumb } from './components/FileThumb.jsx';
import { UploadModal } from './components/UploadModal.jsx';
import './LibraryPage.css';

const PAGE_SIZE = 30;
// "New this week" already shows what's recent, so the grid opens on what people use most.
const DEFAULT_SORT = 'downloads';

const KIND_ICONS = {
  'past-paper': Exam,
  'examiners-report': ClipboardText,
  'subject-guide': BookOpenText,
  reading: Books,
  'study-guide': Notebook,
  exercises: PencilLine,
  notes: NotePencil,
  'cheat-sheet': Lightning,
};

/** All library filters live in the URL: ?year=&module=&type=&q=&sort=&view=&starred=1 */
function useLibraryParams() {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (patch, { replace = true } = {}) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === '') p.delete(k);
            else p.set(k, String(v));
          }
          return p;
        },
        { replace },
      );
    },
    [setParams],
  );
  return [params, update];
}

function NewThisWeek({ files, total, yearLabel, linkState }) {
  if (!files.length) return null;
  return (
    <PageSection className="lib-new" aria-labelledby="lib-new-title" data-pulse="library-new">
      <div className="lib-new__head">
        <h2 id="lib-new-title" className="lib-new__title">New this week</h2>
        <p className="lib-new__desc">
          {total} {total === 1 ? 'file' : 'files'} added {yearLabel ? `for ${yearLabel} ` : ''}in the last 7 days
        </p>
      </div>
      <ul className="lib-new__list" role="list">
        {files.map((f) => (
          <li key={f.id} className="lib-new__item" data-pulse="file-card">
            <Link to={f.url} state={linkState} className="lib-new__link">
              <FileThumb file={f} size="strip" />
              <span className="lib-new__name">{f.title}</span>
              <span className="lib-new__meta">
                <span className="lib-new__code">{moduleTag(f)}</span>
                <span>{timeAgo(f.addedAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

export default function LibraryPage() {
  useDocumentTitle('Library');
  const location = useLocation();
  const { year: globalYear } = useYear();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [params, update] = useLibraryParams();
  const { starred, isStarred, toggle } = useStarred();
  const searchRef = useRef(null);
  const [upload, setUpload] = useState({ open: false, key: 0 });

  // ── Read filters from the URL ─────────────────────────────────────
  const q = params.get('q') || '';
  const moduleParam = params.get('module');
  const module = moduleParam ? getModule(moduleParam) : null;
  const kind = KIND_BY_ID[params.get('type')] ? params.get('type') : null;
  const sort = SORTS[params.get('sort')] ? params.get('sort') : DEFAULT_SORT;
  const view = params.get('view') === 'list' ? 'list' : 'grid';
  const starredOnly = params.get('starred') === '1';
  const yearParam = params.get('year');
  let year = yearParam === 'all' ? null : normalizeYear(yearParam) ?? globalYear ?? null;
  if (module && year && module.year !== year) year = module.year; // a module link wins over the default year
  const yearValue = year == null ? 'all' : year;

  const filters = useMemo(
    () => ({ year, module: module?.id || null, kind, q, starred: starredOnly ? starred : null }),
    [year, module, kind, q, starredOnly, starred],
  );
  const files = useMemo(() => filterFiles(filters, sort), [filters, sort]);
  const facets = useMemo(() => facetCounts(filters), [filters]);
  const allNew = useMemo(() => getNewFiles({ year }), [year]);
  const newFiles = allNew.slice(0, 8);
  const modules = getModulesForYear(year);
  const linkState = useMemo(() => ({ from: `${location.pathname}${location.search}` }), [location.pathname, location.search]);

  // Progressive rendering: 30 at a time, reset whenever the filters change.
  const signature = `${year}|${module?.id}|${kind}|${q}|${sort}|${starredOnly}|${view}`;
  const [more, setMore] = useState({ sig: signature, n: PAGE_SIZE });
  const limit = more.sig === signature ? more.n : PAGE_SIZE;
  const shown = files.slice(0, limit);

  // "/" focuses the search field.
  useEffect(() => {
    const onKey = (e) => {
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

  const setYear = (v) => {
    const y = v === 'all' ? null : Number(v);
    const isDefault = (y ?? null) === (globalYear ?? null);
    update({ year: isDefault ? null : v === 'all' ? 'all' : String(v), module: module && y && module.year !== y ? null : moduleParam });
  };
  const anyFilter = Boolean(module || kind || q || starredOnly);
  const clearFilters = () => update({ module: null, type: null, q: null, starred: null });

  const yearOptions = [
    { value: 'all', label: isMobile ? 'All' : 'All years' },
    ...[1, 2, 3].map((y) => ({ value: y, label: isMobile ? `Y${y}` : `Year ${y}`, ariaLabel: `Year ${y}`, color: `var(--y${y})`, onColor: `var(--on-y${y})` })),
  ];

  const context = [module ? moduleTag({ moduleCode: module.unitCode, moduleShort: module.shortName }) : null, kind ? KIND_BY_ID[kind].plural.toLowerCase() : null]
    .filter(Boolean)
    .join(' ');
  const yearLabel = year ? cohortLabel(year) : null;
  const totalForYear = facetCounts({ year }).all;

  return (
    <Page width="wide" className="lib-page">
      <PageHeader
        title="Library"
        description="Study guides, past papers, notes and cheat sheets you can read right here. Every file keeps a link to its original on Google Drive."
        actions={
          <Button variant="primary" leadingIcon={UploadSimple} onClick={() => setUpload((u) => ({ open: true, key: u.key + 1 }))} data-pulse="upload-button">
            Upload a file
          </Button>
        }
        meta={
          <>
            <span className="lib-head-meta">
              <strong className="u-tabular">{totalForYear}</strong> files {yearLabel ? `for ${yearLabel}` : 'across all years'}
            </span>
            {allNew.length ? <Badge tone="highlight">{allNew.length} new this week</Badge> : null}
          </>
        }
      />

      <NewThisWeek files={newFiles} total={allNew.length} yearLabel={yearLabel} linkState={linkState} />

      <PageSection aria-label="Browse files" className="lib-browse">
        <div className="lib-filters" data-pulse="library-filters">
          <div className="lib-filters__top">
            <SearchField
              ref={searchRef}
              className="lib-filters__search"
              value={q}
              onValueChange={(v) => update({ q: v || null })}
              placeholder="Search files, module codes or authors"
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
                  color={year ? null : `var(--y${m.year})`}
                  title={m.name}
                >
                  {m.unitCode ? <span className="lib-chip-code">{m.unitCode}</span> : null}
                  {m.unitCode ? ` ${m.shortName}` : m.shortName}
                </Chip>
              ))}
            </div>
          </div>
          <div className="lib-filters__row" role="group" aria-label="Type">
            <div className="lib-filters__chips">
              <Chip selected={!kind} onChange={() => update({ type: null })}>
                All types
              </Chip>
              {KINDS.filter((k) => facets.kinds[k.id] || kind === k.id).map((k) => (
                <Chip key={k.id} selected={kind === k.id} onChange={(on) => update({ type: on ? k.id : null })} icon={KIND_ICONS[k.id]} count={facets.kinds[k.id] || 0}>
                  {k.plural}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="lib-results-bar">
          <p className="lib-count" aria-live="polite">
            <strong className="u-tabular">{files.length}</strong> {files.length === 1 ? 'file' : 'files'}
            {context ? <span> in {context}</span> : null}
            {q ? <span> matching “{q}”</span> : null}
          </p>
          <div className="lib-results-bar__tools">
            <Chip selected={starredOnly} onChange={(on) => update({ starred: on ? '1' : null })} icon={<Star weight={starredOnly ? 'fill' : 'regular'} />} count={starred.size}>
              Starred
            </Chip>
            <Menu
              align="end"
              label="Sort files"
              trigger={
                <Button variant="ghost" size="sm" trailingIcon={CaretDown} className="lib-sort">
                  <span className="lib-sort__label">Sort: </span>
                  {SORTS[sort].label}
                </Button>
              }
              items={Object.entries(SORTS).map(([id, s]) => ({
                id,
                label: s.label,
                icon: id === sort ? Check : <span className="lib-sort__blank" />,
                onSelect: () => update({ sort: id === DEFAULT_SORT ? null : id }),
              }))}
            />
            <SegmentedControl
              label="View"
              size="sm"
              iconOnly
              value={view}
              onChange={(v) => update({ view: v === 'grid' ? null : v })}
              options={[
                { value: 'grid', label: 'Grid', icon: SquaresFour },
                { value: 'list', label: 'List', icon: Rows },
              ]}
            />
          </div>
        </div>

        {files.length === 0 ? (
          <div className="lib-empty">
            {starredOnly && !starred.size ? (
              <EmptyState
                icon={Star}
                title="No starred files yet"
                body="Star the files you keep coming back to and they will wait for you here."
                action={<Button onClick={() => update({ starred: null })}>Show all files</Button>}
              />
            ) : (
              <EmptyState
                icon={MagnifyingGlass}
                title="No files match these filters"
                body={q ? `Nothing matches “${q}”. Check the spelling, try a module code like ST2133, or search all years.` : 'Try another module or type, or search all years.'}
                action={
                  <>
                    <Button onClick={clearFilters}>Clear filters</Button>
                    {year ? <Button variant="ghost" onClick={() => setYear('all')}>Search all years</Button> : null}
                  </>
                }
              />
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="lib-grid">
            {shown.map((f) => (
              <FileCard key={f.id} file={f} sort={sort} starred={isStarred(f.id)} onToggleStar={() => toggle(f.id)} linkState={linkState} thumbSize={isMobile ? 'strip' : 'grid'} />
            ))}
          </div>
        ) : (
          <FileTable files={shown} sort={sort} onSort={(id) => update({ sort: id === DEFAULT_SORT ? null : id })} isStarred={isStarred} onToggleStar={toggle} linkState={linkState} />
        )}

        {files.length > limit ? (
          <div className="lib-more">
            <Button onClick={() => setMore({ sig: signature, n: limit + PAGE_SIZE })}>
              Show {Math.min(PAGE_SIZE, files.length - limit)} more
            </Button>
            <span className="lib-more__count">
              Showing {limit} of {files.length}
            </span>
          </div>
        ) : null}
        {anyFilter && files.length ? (
          <div className={cx('lib-clear', files.length > limit && 'is-after-more')}>
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : null}
      </PageSection>

      <UploadModal
        key={upload.key}
        open={upload.open}
        onClose={() => setUpload((u) => ({ ...u, open: false }))}
        defaultModule={module?.id}
        defaultYear={year}
      />
    </Page>
  );
}
