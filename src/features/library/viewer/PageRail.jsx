import { useEffect, useRef, useState } from 'react';
import { cx } from '../../../ui';
import { pageSizeOf } from '../data/kinds.js';
import { DocPage } from '../doc/DocPage.jsx';

const THUMB_W = 116;
const PAD = 12;

/** Page thumbnails down the left of the viewer. Only thumbnails near the visible range render pages. */
export function PageRail({ file, current, onSelect }) {
  const ref = useRef(null);
  const size = pageSizeOf(file);
  const k = THUMB_W / size.w;
  const thumbH = Math.round(size.h * k);
  const itemH = thumbH + 38;
  const [range, setRange] = useState({ first: 0, last: 10 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0;
    const measure = () => {
      const first = Math.max(0, Math.floor((el.scrollTop - PAD) / itemH) - 2);
      const last = Math.min(file.pages - 1, Math.ceil((el.scrollTop + el.clientHeight) / itemH) + 2);
      setRange((r) => (r.first === first && r.last === last ? r : { first, last }));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [itemH, file.pages]);

  // Keep the current page's thumbnail in view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = PAD + current * itemH;
    if (top < el.scrollTop || top + itemH > el.scrollTop + el.clientHeight) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ top: Math.max(0, top - el.clientHeight / 2 + itemH / 2), behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [current, itemH]);

  return (
    <nav ref={ref} className="lib-rail" aria-label="Pages">
      <ol className="lib-rail__list" role="list">
        {Array.from({ length: file.pages }, (_, i) => {
          const near = i >= range.first && i <= range.last;
          return (
            <li key={i} style={{ height: itemH }}>
              <button
                type="button"
                className={cx('lib-rail__item', i === current && 'is-current')}
                onClick={() => onSelect(i)}
                aria-label={`Page ${i + 1}`}
                aria-current={i === current ? 'page' : undefined}
              >
                <span className="lib-rail__thumb" style={{ width: THUMB_W, height: thumbH }}>
                  {near ? (
                    <span className="lib-rail__sheet" style={{ transform: `scale(${k})` }}>
                      <DocPage file={file} index={i} />
                    </span>
                  ) : null}
                </span>
                <span className="lib-rail__num">{i + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
