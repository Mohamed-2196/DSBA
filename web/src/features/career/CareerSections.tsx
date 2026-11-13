// The tabs at the top of Career Navigator: one per part of the page, sticky under the top bar. Only the chosen part
// shows; the others wait, mounted, so what a student filtered or unfolded there is still there when they come back.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx, useScrollFade } from '../../ui';
import { partPanelId, partTabId } from './lib/jump';

export interface CareerPart {
  /** the part's name in the URL (?part=) */
  id: string;
  label: string;
}

export function CareerSections({
  parts,
  current,
  onSelect,
}: {
  parts: readonly CareerPart[];
  current: string;
  onSelect: (id: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  useScrollFade(rowRef, null, parts.map((p) => p.id).join());

  // Keep the chosen tab in view in the row (phones scroll it sideways).
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>('.is-current');
    if (!row || !tab) return;
    const pad = 16;
    if (tab.offsetLeft - pad < row.scrollLeft) row.scrollLeft = tab.offsetLeft - pad;
    else if (tab.offsetLeft + tab.offsetWidth + pad > row.scrollLeft + row.clientWidth)
      row.scrollLeft = tab.offsetLeft + tab.offsetWidth + pad - row.clientWidth;
  }, [current]);

  if (parts.length < 2) return null;

  // Arrow keys, Home and End move between the tabs, as in any tab list.
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = parts.length - 1;
    const keys: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const to = keys[e.key];
    if (to === undefined) return;
    e.preventDefault();
    onSelect(parts[to].id);
    document.getElementById(partTabId(parts[to].id))?.focus();
  };

  return (
    <nav className="career-parts" aria-label="Parts of Career Navigator" data-hub="career-parts">
      <div className="career-parts__row u-scroll-row" role="tablist" ref={rowRef}>
        {parts.map((p, i) => {
          const on = current === p.id;
          return (
            <button
              key={p.id}
              id={partTabId(p.id)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={partPanelId(p.id)}
              tabIndex={on ? 0 : -1}
              className={cx('career-parts__link', on && 'is-current')}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              data-part-id={p.id}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** One part's panel: shown while its tab is chosen. */
export function CareerPartPanel({ id, current, children }: { id: string; current: string; children: ReactNode }) {
  return (
    <div
      id={partPanelId(id)}
      role="tabpanel"
      aria-labelledby={partTabId(id)}
      hidden={current !== id}
      data-career-part={id}
    >
      {children}
    </div>
  );
}
