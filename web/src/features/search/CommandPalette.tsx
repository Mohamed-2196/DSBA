// ⌘K command palette: search everything + quick actions. Mounted once by the shell.
// Opens on ⌘K / Ctrl+K (toggle), "/" (outside text fields) and openCommandPalette(query).
// Content comes from GET /api/v1/search (debounced); recent searches stay in this browser.
import { createElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowSquareOut,
  ArrowsLeftRight,
  Bank,
  Books,
  Calculator,
  CalendarDots,
  CaretDown,
  ChatsCircle,
  ClockCounterClockwise,
  GithubLogo,
  GraduationCap,
  House,
  Info,
  MagnifyingGlass,
  Moon,
  Newspaper,
  PencilSimpleLine,
  SquaresFour,
  Sun,
  X,
  type Icon,
} from '@phosphor-icons/react';
import { useLocalStorage, useTheme, useToast, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { HubMark, Kbd, Modal, ModuleIcon, cx } from '../../ui';
import { formatMonthShort } from '../calendar/public';
import { useDebouncedValue, useSearch } from './api';
import { OPEN_PALETTE_EVENT, type OpenPaletteDetail } from './bus';
import { matchRanges, tokenize } from './match';
import { runSearch, textOf, type GroupId, type IconName, type Item } from './search';
import './CommandPalette.css';

// 'hub.mine.' keys are cleared on sign-out (shared lab computers: security review, finding 23).
const RECENT_KEY = 'hub.mine.search.recent';
const ICONS: Record<IconName, Icon> = { ArrowsLeftRight, Bank, Books, Calculator, CalendarDots, ChatsCircle, GithubLogo, GraduationCap, House, Info, Moon, Newspaper, PencilSimpleLine, SquaresFour, Sun };

const NO_TOKENS: string[] = [];
const isEditable = (el: EventTarget | null): boolean => el instanceof Element && !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
const otherDialogOpen = (): boolean => [...document.querySelectorAll('[aria-modal="true"]')].some((d) => !d.closest('[data-hub="cmdk"]'));
const recentOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 5) : []);

/** Text with every query token marked. */
function Marked({ text, tokens, className = 'cmdk-mark' }: { text: string | null | undefined; tokens: readonly string[]; className?: string }) {
  if (!text) return null;
  const ranges = matchRanges(text, tokens);
  if (!ranges.length) return <>{text}</>;
  const out: (string | JSX.Element)[] = [];
  let pos = 0;
  ranges.forEach(([a, b], i) => {
    if (a > pos) out.push(text.slice(pos, a));
    out.push(
      <mark key={i} className={className}>
        {text.slice(a, b)}
      </mark>,
    );
    pos = b;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

function DateTile({ when, type }: { when: Date; type: string | null }) {
  return (
    <span className={cx('cmdk-date', type && `cmdk-date--${type}`)} aria-hidden="true">
      <span className="cmdk-date__m">{formatMonthShort(when)}</span>
      <span className="cmdk-date__d u-tabular">{when.getDate()}</span>
    </span>
  );
}

function Leading({ item }: { item: Item }) {
  switch (item.kind) {
    case 'module':
      return (
        <span className={cx('cmdk-tile', 'cmdk-tile--module', item.year && `cmdk-tile--y${item.year}`)} aria-hidden="true">
          <ModuleIcon moduleId={item.moduleId} />
        </span>
      );
    case 'file':
      return <span className="cmdk-doc" aria-hidden="true" />;
    case 'thread':
      return (
        <span className="cmdk-tile" aria-hidden="true">
          <ChatsCircle />
        </span>
      );
    case 'issue':
      return (
        <span className="cmdk-tile cmdk-tile--issue" aria-hidden="true">
          {item.number != null ? String(item.number).padStart(2, '0') : <Newspaper />}
        </span>
      );
    case 'event':
      return item.when ? (
        <DateTile when={item.when} type={item.eventType} />
      ) : (
        <span className="cmdk-tile" aria-hidden="true">
          <CalendarDots />
        </span>
      );
    case 'recent':
      return <ClockCounterClockwise className="cmdk-glyph" aria-hidden="true" />;
    case 'suggestion':
      return <MagnifyingGlass className="cmdk-glyph" aria-hidden="true" />;
    case 'more':
      return <CaretDown className="cmdk-glyph" aria-hidden="true" weight="bold" />;
    case 'action':
    case 'page':
    case 'fallback':
      return (
        <span className="cmdk-tile" aria-hidden="true">
          {createElement(ICONS[item.icon])}
        </span>
      );
  }
}

function Trailing({ item, tokens, active }: { item: Item; tokens: readonly string[]; active: boolean }) {
  let meta = null;
  if (item.kind === 'module' && item.code)
    meta = (
      <span className="cmdk-code u-code">
        <Marked text={item.code} tokens={tokens} className="cmdk-mark cmdk-mark--code" />
      </span>
    );
  else if (item.kind === 'event' && item.rel) meta = <span className={cx('cmdk-meta', !item.past && item.eventType === 'exam' && 'is-exam')}>{item.rel}</span>;
  else if (item.kind === 'thread' && item.meta) meta = <span className="cmdk-meta u-tabular">{item.meta}</span>;
  else if (item.kind === 'action' && item.href) meta = <ArrowSquareOut className="cmdk-ext" aria-label="Opens in a new tab" />;
  return (
    <span className="cmdk-trail">
      {meta}
      <span className={cx('cmdk-enter', active && 'is-on')} aria-hidden="true">
        <Kbd>↵</Kbd>
      </span>
    </span>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<Set<GroupId>>(() => new Set());
  const [stored, setRecent] = useLocalStorage<string[]>(RECENT_KEY, []);
  const recent = useMemo(() => recentOf(stored), [stored]);
  const { year, activeYear, setYear } = useYear();
  const { theme, toggleTheme } = useTheme();
  const { getModule, getModulesForYear } = useModules();
  const { push } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const moveRef = useRef<'query' | 'nav'>('query');
  const uid = useId().replace(/:/g, '');

  // What goes to the API: the words without a cohort ("year 2"), once typing pauses.
  const text = textOf(query);
  const debounced = useDebouncedValue(text, 180);
  const search = useSearch(open ? debounced : '');
  const waiting = text.length > 0 && (text !== debounced || search.isFetching);

  const reset = useCallback((q: string) => {
    moveRef.current = 'query';
    setQuery(q);
    setActive(0);
    setExpanded(new Set());
  }, []);
  const show = useCallback(
    (q = '') => {
      reset(q);
      setOpen(true);
    },
    [reset],
  );
  const close = useCallback(() => setOpen(false), []);

  // Bindings: ⌘K / Ctrl+K toggles, "/" opens outside text fields, openCommandPalette() opens.
  useEffect(() => {
    const onOpen = (e: Event) => {
      if (otherDialogOpen()) return;
      show((e as CustomEvent<OpenPaletteDetail>).detail?.query ?? '');
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        if (otherDialogOpen()) return;
        setOpen((o) => {
          if (!o) reset('');
          return !o;
        });
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.defaultPrevented && !isEditable(e.target) && !otherDialogOpen()) {
        e.preventDefault();
        show('');
      }
    };
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, [show, reset]);

  const results = useMemo(
    () =>
      runSearch({
        query,
        year: year ?? activeYear,
        theme,
        expanded,
        recent,
        results: search.data,
        getModule,
        getModulesForYear,
      }),
    [query, year, activeYear, theme, expanded, recent, search.data, getModule, getModulesForYear],
  );
  // Until the API has answered the words typed, "nothing found" would be premature.
  const searching = results.empty && waiting;
  const failed = results.empty && !waiting && search.isError;
  const groups = useMemo(() => (searching ? [] : results.groups), [searching, results]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const activeIndex = flat.length ? Math.min(active, flat.length - 1) : -1;
  const activeItem = activeIndex >= 0 ? flat[activeIndex] : undefined;
  const tokens = useMemo(() => tokenize(text), [text]);
  const optionId = (i: number) => `cmdk${uid}-o${i}`;

  // Keep the active row in view and slide the selection indicator onto it.
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const bar = indicatorRef.current;
    if (!list || !bar) return;
    const el = activeIndex >= 0 ? list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`) : null;
    if (!el) {
      bar.style.opacity = '0';
      return;
    }
    const lr = list.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    bar.style.transition = moveRef.current === 'nav' ? '' : 'none';
    bar.style.opacity = '1';
    bar.style.height = `${r.height}px`;
    bar.style.transform = `translateY(${r.top - lr.top + list.scrollTop}px)`;
    const first = el.getAttribute('data-first') === 'true';
    (first ? (el.closest('[role="group"]') ?? el) : el).scrollIntoView({ block: 'nearest' });
    if (first) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, groups, open]);

  const rememberQuery = useCallback(
    (q: string) => {
      const t = q.trim();
      if (!t) return;
      setRecent((list) => [t, ...recentOf(list).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 5));
    },
    [setRecent],
  );
  const removeRecent = (q: string) => setRecent((list) => recentOf(list).filter((x) => x !== q));

  const activate = (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === 'recent' || item.kind === 'suggestion') {
      reset(item.query);
      inputRef.current?.focus();
      return;
    }
    if (item.kind === 'more') {
      moveRef.current = 'nav';
      setExpanded((s) => new Set(s).add(item.target));
      return;
    }
    if (query.trim() && item.kind !== 'fallback') rememberQuery(query);
    if (item.kind === 'action' && item.run) {
      const run = item.run;
      if (run.type === 'theme') toggleTheme();
      else {
        setYear(run.year);
        push({ title: `Showing Year ${run.year}`, body: 'Modules, exams and threads now follow your new year.', tone: 'success' });
      }
      close();
      return;
    }
    if (item.kind === 'action' && item.href) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
      close();
      return;
    }
    if ('to' in item && item.to) {
      close();
      navigate(item.to);
    }
  };

  const move = (delta: number) => {
    if (!flat.length) return;
    moveRef.current = 'nav';
    setActive((i) => {
      const cur = Math.min(i, flat.length - 1);
      return (cur + delta + flat.length) % flat.length;
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      moveRef.current = 'nav';
      setActive((i) => Math.min(flat.length - 1, i + 5));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      moveRef.current = 'nav';
      setActive((i) => Math.max(0, i - 5));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(activeItem);
    } else if (e.key === 'Escape' && query) {
      // First Esc clears the query; the next one closes (the Modal handles that).
      e.preventDefault();
      e.stopPropagation();
      reset('');
    } else if (e.key === 'Delete' && !query && activeItem?.kind === 'recent') {
      e.preventDefault();
      removeRecent(activeItem.query);
    }
  };

  const hasQuery = query.trim().length > 0;
  const status = !hasQuery
    ? ''
    : searching
      ? 'Searching…'
      : failed
        ? 'Search isn’t available right now'
        : results.empty
          ? `No results for ${query.trim()}`
          : `${results.count} ${results.count === 1 ? 'result' : 'results'}`;
  let index = -1;

  return (
    <Modal open={open} onClose={close} title="Search DSBA Hub" hideHeader size="lg" initialFocusRef={inputRef} className="cmdk" bodyClassName="cmdk-body" data-hub="cmdk">
      <div className="cmdk-field">
        <MagnifyingGlass className="cmdk-field__icon" aria-hidden="true" />
        <input
          ref={inputRef}
          className="cmdk-input"
          dir="auto"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`cmdk${uid}-list`}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label="Search modules, files, threads, The DSBA Newsletter and dates"
          placeholder="Search modules, files, threads, dates…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={200}
          value={query}
          onChange={(e) => reset(e.target.value)}
          onKeyDown={onKeyDown}
          data-hub="cmdk-input"
        />
        {waiting ? <HubMark size={9} animate="loop" className="cmdk-field__loading" /> : null}
        {query ? (
          <button
            type="button"
            className="cmdk-field__clear"
            aria-label="Clear search"
            tabIndex={-1}
            onClick={() => {
              reset('');
              inputRef.current?.focus();
            }}
          >
            <X weight="bold" aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" className="cmdk-field__esc" onClick={close} tabIndex={-1} aria-label="Close search">
          <Kbd>Esc</Kbd>
        </button>
      </div>

      <div ref={listRef} id={`cmdk${uid}-list`} role="listbox" aria-label="Search results" className="cmdk-list" data-hub="cmdk-results">
        <span ref={indicatorRef} className="cmdk-indicator" aria-hidden="true" />
        {searching ? (
          <div className="cmdk-empty" aria-busy="true">
            <p className="cmdk-empty__title">Searching for “{query.trim()}”…</p>
          </div>
        ) : failed ? (
          <div className="cmdk-empty">
            <p className="cmdk-empty__title">Search isn’t available right now</p>
            <p className="cmdk-empty__body">Check your connection and try again in a moment, or look in the library or the forum.</p>
          </div>
        ) : results.empty ? (
          <div className="cmdk-empty">
            <p className="cmdk-empty__title">No results for “{query.trim()}”</p>
            <p className="cmdk-empty__body">Check the spelling, or try a unit code like EC2020, a module name like regression, or a word from a thread title.</p>
          </div>
        ) : null}
        {groups.map((g) => (
          <div key={g.id} role="group" aria-labelledby={`cmdk${uid}-g-${g.id}`} className="cmdk-group">
            <div className="cmdk-group__head" id={`cmdk${uid}-g-${g.id}`}>
              <span>{g.label}</span>
              {g.id === 'recent' ? (
                <button
                  type="button"
                  className="cmdk-group__action"
                  tabIndex={-1}
                  onClick={() => {
                    setRecent([]);
                    inputRef.current?.focus();
                  }}
                >
                  Clear
                </button>
              ) : g.total > 0 ? (
                <span className="cmdk-group__count u-tabular">{g.total}</span>
              ) : null}
            </div>
            {g.items.map((item, i) => {
              index += 1;
              const idx = index;
              const isActive = idx === activeIndex;
              const twoLine = !!(item.subtitle || item.kind === 'event');
              return (
                <div
                  key={item.id}
                  id={optionId(idx)}
                  role="option"
                  aria-selected={isActive}
                  data-index={idx}
                  data-first={i === 0 ? 'true' : undefined}
                  className={cx('cmdk-item', `cmdk-item--${item.kind}`, isActive && 'is-active', twoLine && 'is-two-line')}
                  onPointerMove={() => {
                    if (idx !== activeIndex) {
                      moveRef.current = 'nav';
                      setActive(idx);
                    }
                  }}
                  onClick={() => activate(item)}
                >
                  <Leading item={item} />
                  <span className="cmdk-item__text">
                    <span className="cmdk-item__title" dir="auto">
                      <Marked text={item.title} tokens={item.kind === 'fallback' ? NO_TOKENS : tokens} />
                    </span>
                    {item.subtitle ? (
                      <span className="cmdk-item__sub" dir="auto">
                        <Marked text={item.subtitle} tokens={tokens} className="cmdk-mark cmdk-mark--sub" />
                      </span>
                    ) : null}
                  </span>
                  {item.kind === 'recent' ? (
                    <button
                      type="button"
                      className="cmdk-item__remove"
                      tabIndex={-1}
                      aria-label={`Remove ${item.query} from recent searches`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecent(item.query);
                        inputRef.current?.focus();
                      }}
                    >
                      <X weight="bold" aria-hidden="true" />
                    </button>
                  ) : (
                    <Trailing item={item} tokens={tokens} active={isActive} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="cmdk-foot" aria-hidden="true">
        <span className="cmdk-foot__keys">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span>
            <Kbd>↵</Kbd> to {activeItem?.kind === 'recent' || activeItem?.kind === 'suggestion' ? 'search' : activeItem?.kind === 'more' ? 'show more' : 'open'}
          </span>
          <span>
            <Kbd>Esc</Kbd> to {query ? 'clear' : 'close'}
          </span>
        </span>
        <span className="cmdk-foot__status">
          {hasQuery ? (
            status
          ) : (
            <>
              Press <Kbd>/</Kbd> anywhere to search
            </>
          )}
        </span>
      </div>
      <span className="visually-hidden" role="status" aria-live="polite">
        {status}
      </span>
    </Modal>
  );
}
