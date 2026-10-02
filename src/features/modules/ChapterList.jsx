// Chapter list beside the player: chapters with per-chapter progress, expanding to their videos.
// Each video is a link (?tab=lessons&chapter=<i>&video=<j>), so lessons can be opened in a new tab.
import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowCounterClockwise, CaretDown, Check, CheckCircle, Circle, DotsThree, PlayCircle } from '@phosphor-icons/react';
import { lessonKey } from '../../data/modules.js';
import { cohortColor } from '../../state';
import { IconButton, Menu, ProgressRing, cx } from '../../ui';
import { computeChapterProgress, computeModuleProgress } from './progress.js';
import { KIND_ICON, kindLabel, lessonLabel, lessonSearch } from './lessons.js';

/** '9 videos', '6 class recordings', '1 playlist', '4 recordings and 3 videos'. */
function chapterContents(ch) {
  const counts = ch.videos.reduce((acc, v) => ({ ...acc, [v.kind]: (acc[v.kind] || 0) + 1 }), {});
  const parts = [];
  if (counts.youtube) parts.push(`${counts.youtube} ${counts.youtube === 1 ? 'video' : 'videos'}`);
  if (counts.bbb) parts.push(`${counts.bbb} ${counts.bbb === 1 ? 'class recording' : 'class recordings'}`);
  if (counts['youtube-playlist']) parts.push(`${counts['youtube-playlist']} ${counts['youtube-playlist'] === 1 ? 'playlist' : 'playlists'}`);
  return parts.join(' and ');
}

/** @param {string} nowLabel  what the current lesson's row says: 'Playing' once loaded, else 'Selected'. */
export function ChapterList({ module: m, selection, state, nowLabel = 'Selected', onReset, onPick }) {
  const { c: selC, v: selV } = selection;
  const [open, setOpen] = useState(() => new Set([selC]));
  const [seenSel, setSeenSel] = useState(selC);
  if (seenSel !== selC) {
    // A new chapter was selected (Next, a link, the URL): make sure it is expanded.
    setSeenSel(selC);
    setOpen((s) => new Set(s).add(selC));
  }
  const listRef = useRef(null);
  const p = computeModuleProgress(state, m);
  const color = cohortColor(m.year);

  // Keep the current lesson in view inside the list's own scroll area (never scrolls the page).
  useLayoutEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector('[aria-current="true"]');
    if (!list || !el || list.scrollHeight <= list.clientHeight) return;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top < lr.top + 8 || er.bottom > lr.bottom - 8) list.scrollTop += er.top - lr.top - lr.height / 3;
  }, [selC, selV]);

  const toggle = (ci) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(ci)) n.delete(ci);
      else n.add(ci);
      return n;
    });

  return (
    <nav className="mod-chapters" aria-label={`${m.unitCode || m.name} chapters and lessons`} data-hub="lesson-list">
      <div className="mod-chapters__head">
        <div className="mod-chapters__heading">
          <h2 className="mod-chapters__title">Chapters</h2>
          <p className="mod-chapters__sum">
            <b className="u-tabular">{p.watched}</b> of <span className="u-tabular">{p.total}</span> lessons watched
          </p>
        </div>
        <Menu
          align="end"
          label="Lesson options"
          trigger={<IconButton label="Lesson options" icon={DotsThree} size="sm" />}
          items={[{ id: 'reset', label: 'Clear my progress in this module', icon: ArrowCounterClockwise, danger: true, onSelect: onReset, disabled: p.watched === 0 && !state.last[m.id] }]}
        />
      </div>
      <div className="mod-chapters__bar" aria-hidden="true">
        <span style={{ width: `${p.pct}%`, background: p.pct === 100 ? 'var(--signal)' : color }} />
      </div>

      <ol className="mod-chapters__list" role="list" ref={listRef}>
        {m.chapters.map((ch, ci) => {
          const cp = computeChapterProgress(state, m, ci);
          const isOpen = open.has(ci);
          const done = cp.total > 0 && cp.watched === cp.total;
          const mixed = new Set(ch.videos.map((x) => x.kind)).size > 1;
          return (
            <li key={ci} className={cx('mod-ch', isOpen && 'is-open', ci === selC && 'is-current', done && 'is-done')}>
              <button type="button" className="mod-ch__head" aria-expanded={isOpen} aria-controls={`mod-ch-${ci}`} onClick={() => toggle(ci)}>
                <span className="mod-ch__ring" aria-hidden="true">
                  <ProgressRing value={cp.pct} size={34} stroke={3} color={done ? 'var(--signal)' : color} showValue={false}>
                    {done ? <Check weight="bold" className="mod-ch__check" /> : <span className="mod-ch__num u-tabular">{ci + 1}</span>}
                  </ProgressRing>
                </span>
                <span className="mod-ch__text">
                  <span className="mod-ch__title">
                    <span className="visually-hidden">Chapter {ci + 1}: </span>
                    {ch.title}
                  </span>
                  <span className="mod-ch__meta">
                    {cp.watched ? `${cp.watched} of ${cp.total} watched` : chapterContents(ch)}
                  </span>
                </span>
                <CaretDown className="mod-ch__caret" aria-hidden="true" weight="bold" />
              </button>

              {isOpen ? (
                <ol id={`mod-ch-${ci}`} className="mod-ch__videos" role="list">
                  {ch.videos.map((vid, vi) => {
                    const current = ci === selC && vi === selV;
                    const seen = Boolean(state.watched[lessonKey(m.id, ci, vi)]);
                    const KindIcon = KIND_ICON[vid.kind];
                    let Status = Circle;
                    if (seen) Status = CheckCircle;
                    else if (current) Status = PlayCircle;
                    return (
                      <li key={vi}>
                        <Link
                          to={{ search: lessonSearch(ci, vi) }}
                          replace
                          className={cx('mod-vid', current && 'is-current', seen && 'is-watched')}
                          aria-current={current ? 'true' : undefined}
                          data-hub="lesson-item"
                          data-lesson={`${ci}:${vi}`}
                          onClick={onPick}
                        >
                          <Status className="mod-vid__status" weight={seen || current ? 'fill' : 'regular'} aria-hidden="true" />
                          <span className="mod-vid__label">
                            {lessonLabel(vid, vi)}
                            {seen ? <span className="visually-hidden"> (watched)</span> : null}
                          </span>
                          {mixed ? (
                            <span className="mod-vid__kind">
                              {KindIcon ? <KindIcon aria-hidden="true" /> : null}
                              {kindLabel(vid)}
                            </span>
                          ) : null}
                          {current ? <span className="mod-vid__now">{nowLabel}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
