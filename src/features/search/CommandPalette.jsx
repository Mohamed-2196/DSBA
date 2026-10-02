// ⌘K command palette: search everything + quick actions. Mounted once by the shell.
// Opens on ⌘K / Ctrl+K (toggle), "/" (outside text fields) and openCommandPalette(query).
import { createElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowSquareOut, ArrowsLeftRight, Bank, Books, Calculator, CalendarDots, CaretDown, ChatsCircle, ClockCounterClockwise,
  GithubLogo, GraduationCap, House, Info, MagnifyingGlass, Moon, Newspaper, PencilSimpleLine, Play, SquaresFour, Sun, X,
} from '@phosphor-icons/react';
import { useLocalStorage, useTheme, useToast, useYear } from '../../state';
import { Kbd, Modal, ModuleIcon, HubMark, cx } from '../../ui';
import { OPEN_PALETTE_EVENT } from './bus.js';
import { matchRanges, tokenize } from './match.js';
import { getSources, loadSources } from './sources.js';
import { runSearch } from './search.js';
import './CommandPalette.css';

const RECENT_KEY = 'hub.search.recent';
const ICONS = { ArrowsLeftRight, Bank, Books, Calculator, CalendarDots, ChatsCircle, GithubLogo, GraduationCap, House, Info, Moon, Newspaper, PencilSimpleLine, SquaresFour, Sun };

const NO_TOKENS = [];
const isEditable = (el) => !!el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
const otherDialogOpen = () => [...document.querySelectorAll('[aria-modal="true"]')].some((d) => !d.closest('[data-hub="cmdk"]'));

/** Text with every query token marked. */
function Marked({ text, tokens, className = 'cmdk-mark' }) {
  if (!text) return null;
  const ranges = matchRanges(text, tokens);
  if (!ranges.length) return text;
  const out = [];
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
  return out;
}

function DateTile({ when, type }) {
  return (
    <span className={cx('cmdk-date', `cmdk-date--${type}`)} aria-hidden="true">
      <span className="cmdk-date__m">{when.toLocaleDateString('en-GB', { month: 'short' })}</span>
      <span className="cmdk-date__d u-tabular">{when.getDate()}</span>
    </span>
  );
}

function Leading({ item }) {
  switch (item.kind) {
    case 'module':
      return (
        <span className={cx('cmdk-tile', 'cmdk-tile--module', `cmdk-tile--y${item.year}`)} aria-hidden="true">
          <ModuleIcon moduleId={item.moduleId} />
        </span>
      );
    case 'lesson':
      return (
        <span className="cmdk-tile cmdk-tile--lesson" aria-hidden="true">
          <Play weight="fill" />
        </span>
      );
    case 'file':
      return (
        <span className="cmdk-doc" aria-hidden="true">
          <span className="cmdk-doc__fmt">{String(item.format || 'doc').toUpperCase().slice(0, 4)}</span>
        </span>
      );
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
      return <DateTile when={item.when} type={item.event.type} />;
    case 'recent':
      return <ClockCounterClockwise className="cmdk-glyph" aria-hidden="true" />;
    case 'suggestion':
      return <MagnifyingGlass className="cmdk-glyph" aria-hidden="true" />;
    case 'more':
      return <CaretDown className="cmdk-glyph" aria-hidden="true" weight="bold" />;
    default:
      return (
        <span className="cmdk-tile" aria-hidden="true">
          {createElement(ICONS[item.icon] || MagnifyingGlass)}
        </span>
      );
  }
}

function Trailing({ item, tokens, active }) {
  let meta = null;
  if (item.kind === 'module' && item.code) meta = <span className="cmdk-code u-code"><Marked text={item.code} tokens={tokens} className="cmdk-mark cmdk-mark--code" /></span>;
  else if (item.kind === 'event') meta = <span className={cx('cmdk-meta', !item.past && item.event.type === 'exam' && 'is-exam')}>{item.rel}</span>;
  else if (item.kind === 'thread' && item.meta) meta = <span className="cmdk-meta u-tabular">{item.meta}</span>;
  else if (item.kind === 'file' && item.isNew) meta = <span className="cmdk-new">New</span>;
  else if (item.href) meta = <ArrowSquareOut className="cmdk-ext" aria-label="Opens in a new tab" />;
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
  const [expanded, setExpanded] = useState(() => new Set());
  const [sources, setSources] = useState(getSources);
  const [recent, setRecent] = useLocalStorage(RECENT_KEY, []);
  const { activeYear, setYear } = useYear();
  const { theme, toggleTheme } = useTheme();
  const { push } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const indicatorRef = useRef(null);
  const moveRef = useRef('query');
  const uid = useId().replace(/:/g, '');

  const show = useCallback((q = '') => {
    moveRef.current = 'query';
    setQuery(q);
    setActive(0);
    setExpanded(new Set());
    setOpen(true);
    loadSources().then(setSources);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  // Bindings: ⌘K / Ctrl+K toggles, "/" opens outside text fields, openCommandPalette() opens.
  useEffect(() => {
    const onOpen = (e) => {
      if (otherDialogOpen()) return;
      show(e.detail?.query || '');
    };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        if (otherDialogOpen()) return;
        setOpen((o) => {
          if (!o) {
            moveRef.current = 'query';
            setQuery('');
            setActive(0);
            setExpanded(new Set());
            loadSources().then(setSources);
          }
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
    // Warm the cross-feature sources once the app is idle, so the first search is complete.
    const idle = window.requestIdleCallback ? window.requestIdleCallback(() => loadSources().then(setSources), { timeout: 3000 }) : window.setTimeout(() => loadSources().then(setSources), 1500);
    return () => {
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
      window.removeEventListener('keydown', onKey);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [show]);

  const results = useMemo(
    () => runSearch(query, { year: activeYear, theme, sources, expanded, recent: Array.isArray(recent) ? recent : [] }),
    [query, activeYear, theme, sources, expanded, recent],
  );
  const flat = useMemo(() => results.groups.flatMap((g) => g.items), [results]);
  const activeIndex = flat.length ? Math.min(active, flat.length - 1) : -1;
  const activeItem = activeIndex >= 0 ? flat[activeIndex] : null;
  const tokens = useMemo(() => tokenize(query.replace(/\b(?:year\s*|y)([123])\b/i, ' ')), [query]);
  const optionId = (i) => `cmdk${uid}-o${i}`;

  // Keep the active row in view and slide the selection indicator onto it.
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const bar = indicatorRef.current;
    if (!list || !bar) return;
    const el = activeIndex >= 0 ? list.querySelector(`[data-index="${activeIndex}"]`) : null;
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
    (first ? el.closest('[role="group"]') || el : el).scrollIntoView({ block: 'nearest' });
    if (first) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results, open]);

  const rememberQuery = useCallback(
    (q) => {
      const t = q.trim();
      if (!t) return;
      setRecent((list) => [t, ...(Array.isArray(list) ? list : []).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 5));
    },
    [setRecent],
  );
  const removeRecent = (q) => setRecent((list) => (Array.isArray(list) ? list : []).filter((x) => x !== q));

  const setQueryFromInput = (v) => {
    moveRef.current = 'query';
    setQuery(v);
    setActive(0);
    setExpanded(new Set());
  };

  const activate = (item) => {
    if (!item) return;
    if (item.kind === 'recent' || item.kind === 'suggestion') {
      setQueryFromInput(item.query);
      inputRef.current?.focus();
      return;
    }
    if (item.kind === 'more') {
      moveRef.current = 'nav';
      setExpanded((s) => new Set(s).add(item.target));
      return;
    }
    if (query.trim() && item.kind !== 'fallback') rememberQuery(query);
    if (item.run?.type === 'theme') {
      toggleTheme();
      close();
      return;
    }
    if (item.run?.type === 'year') {
      setYear(item.run.year);
      push({ title: `Showing Year ${item.run.year}`, body: 'Modules, exams and threads now follow your new year.', tone: 'success' });
      close();
      return;
    }
    if (item.href) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
      close();
      return;
    }
    if (item.to) {
      close();
      navigate(item.to);
    }
  };

  const move = (delta) => {
    if (!flat.length) return;
    moveRef.current = 'nav';
    setActive((i) => {
      const cur = Math.min(i, flat.length - 1);
      return (cur + delta + flat.length) % flat.length;
    });
  };

  const onKeyDown = (e) => {
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
      setQueryFromInput('');
    } else if (e.key === 'Delete' && !query && activeItem?.kind === 'recent') {
      e.preventDefault();
      removeRecent(activeItem.query);
    }
  };

  const loading = !sources && tokens.length > 0;
  const status = !tokens.length ? '' : results.empty ? `No results for ${query.trim()}` : `${results.count} ${results.count === 1 ? 'result' : 'results'}`;
  let index = -1;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Search DSBA Hub"
      hideHeader
      size="lg"
      initialFocusRef={inputRef}
      className="cmdk"
      bodyClassName="cmdk-body"
      data-hub="cmdk"
    >
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
          aria-label="Search modules, lessons, files, threads, The DSBA Newsletter and dates"
          placeholder="Search modules, lessons, files, threads…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(e) => setQueryFromInput(e.target.value)}
          onKeyDown={onKeyDown}
          data-hub="cmdk-input"
        />
        {loading ? <HubMark size={9} animate="loop" className="cmdk-field__loading" /> : null}
        {query ? (
          <button type="button" className="cmdk-field__clear" aria-label="Clear search" tabIndex={-1} onClick={() => { setQueryFromInput(''); inputRef.current?.focus(); }}>
            <X weight="bold" aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" className="cmdk-field__esc" onClick={close} tabIndex={-1} aria-label="Close search">
          <Kbd>Esc</Kbd>
        </button>
      </div>

      <div ref={listRef} id={`cmdk${uid}-list`} role="listbox" aria-label="Search results" className="cmdk-list" data-hub="cmdk-results">
        <span ref={indicatorRef} className="cmdk-indicator" aria-hidden="true" />
        {results.empty ? (
          <div className="cmdk-empty">
            <p className="cmdk-empty__title">No results for “{query.trim()}”</p>
            <p className="cmdk-empty__body">Check the spelling, or try a unit code like EC2020, a chapter name like regression, or a word from a thread title.</p>
          </div>
        ) : null}
        {results.groups.map((g) => (
          <div key={g.id} role="group" aria-labelledby={`cmdk${uid}-g-${g.id}`} className="cmdk-group">
            <div className="cmdk-group__head" id={`cmdk${uid}-g-${g.id}`}>
              <span>{g.label}</span>
              {g.id === 'recent' ? (
                <button type="button" className="cmdk-group__action" tabIndex={-1} onClick={() => { setRecent([]); inputRef.current?.focus(); }}>
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
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
          <span><Kbd>↵</Kbd> to {activeItem?.kind === 'recent' || activeItem?.kind === 'suggestion' ? 'search' : activeItem?.kind === 'more' ? 'show more' : 'open'}</span>
          <span><Kbd>Esc</Kbd> to {query ? 'clear' : 'close'}</span>
        </span>
        <span className="cmdk-foot__status">{tokens.length ? status : <>Press <Kbd>/</Kbd> anywhere to search</>}</span>
      </div>
      <span className="visually-hidden" role="status" aria-live="polite">{status}</span>
    </Modal>
  );
}
