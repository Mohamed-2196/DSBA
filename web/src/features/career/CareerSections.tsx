// The row of links under Career Navigator's title: one per part of the page, sticky under the top bar, the part in
// view marked. On a phone the page is long, so a student jumps to what they came for instead of scrolling past it.
import { useEffect, useRef, useState } from 'react';
import { cx, useScrollFade } from '../../ui';
import { jumpTo } from './lib/jump';

export interface CareerPart {
  /** the section's element id */
  id: string;
  label: string;
}

export function CareerSections({ parts }: { parts: CareerPart[] }) {
  const [current, setCurrent] = useState(parts[0]?.id ?? '');
  const rowRef = useRef<HTMLDivElement>(null);
  useScrollFade(rowRef, null, parts.map((p) => p.id).join());
  const ids = parts.map((p) => p.id).join(' ');

  // The part in view: the last one whose top has passed the upper third of the screen.
  useEffect(() => {
    const els = ids
      .split(' ')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!els.length) return undefined;
    const update = () => {
      const line = window.innerHeight / 3;
      let at = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top <= line) at = el.id;
      setCurrent(at);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ids]);

  // Keep the current part's link in view in the row (phones scroll it sideways).
  useEffect(() => {
    const row = rowRef.current;
    const link = row?.querySelector<HTMLElement>('.is-current');
    if (!row || !link) return;
    const pad = 16;
    if (link.offsetLeft - pad < row.scrollLeft) row.scrollLeft = link.offsetLeft - pad;
    else if (link.offsetLeft + link.offsetWidth + pad > row.scrollLeft + row.clientWidth)
      row.scrollLeft = link.offsetLeft + link.offsetWidth + pad - row.clientWidth;
  }, [current]);

  if (parts.length < 2) return null;
  return (
    <nav className="career-parts" aria-label="Parts of Career Navigator" data-hub="career-parts">
      <div className="career-parts__row u-scroll-row" ref={rowRef}>
        {parts.map((p) => (
          <button
            key={p.id}
            type="button"
            className={cx('career-parts__link', current === p.id && 'is-current')}
            aria-current={current === p.id ? 'location' : undefined}
            onClick={() => {
              setCurrent(p.id);
              jumpTo(p.id);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
