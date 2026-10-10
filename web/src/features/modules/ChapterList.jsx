// Chapter list beside the player: chapters with per-chapter progress, expanding to their videos.
// Each video is a link (?tab=lessons&chapter=<i>&video=<j>), so lessons can be opened in a new tab.
import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowCounterClockwise, CaretDown, Check, CheckCircle, DotsThree, Play, Warning } from '@phosphor-icons/react';
import { lessonKey, videoThumbnailUrl } from '../../data/modules';
import { cohortColor } from '../../state';
import { IconButton, Menu, ProgressRing, cx } from '../../ui';
import { computeChapterProgress, computeModuleProgress } from './progress';
import { KIND_ICON, chapterLessons, lessonSearch } from './lessons';
import { useThumbnail } from './thumbs';

/** '9 videos', '6 class recordings', '1 playlist', '4 recordings and 3 videos'. */
function chapterContents(ch) {
  const counts = ch.videos.reduce((acc, v) => ({ ...acc, [v.kind]: (acc[v.kind] || 0) + 1 }), {});
  const parts = [];
  if (counts.youtube) parts.push(`${counts.youtube} ${counts.youtube === 1 ? 'video' : 'videos'}`);
  if (counts.bbb) parts.push(`${counts.bbb} ${counts.bbb === 1 ? 'class recording' : 'class recordings'}`);
  if (counts['youtube-playlist']) parts.push(`${counts['youtube-playlist']} ${counts['youtube-playlist'] === 1 ? 'playlist' : 'playlists'}`);
  return parts.join(' and ');
}

/**
 * The 16:9 tile that starts a lesson row: the real YouTube thumbnail when it loads (same probe as the
 * poster), otherwise a quiet tile with the kind's icon. Class recordings have no thumbnail, so they
 * always get the tile. Watched / playing are marked on it.
 */
function RowThumb({ video, current, seen }) {
  const src = videoThumbnailUrl(video);
  const loaded = useThumbnail(src) === 'ok';
  const KindIcon = KIND_ICON[video.kind];
  return (
    <span className={cx('mod-vid__thumb', loaded && 'has-img')} aria-hidden="true">
      {loaded ? <img src={src} alt="" decoding="async" /> : KindIcon ? <KindIcon className="mod-vid__ticon" weight="duotone" /> : null}
      {current ? (
        <span className="mod-vid__playing">
          <Play weight="fill" />
        </span>
      ) : null}
      {seen ? <CheckCircle className="mod-vid__seen" weight="fill" /> : null}
    </span>
  );
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

  // Keep the current lesson in view inside the list's own scroll area (never scrolls the page), roughly
  // centred so the lessons on either side of it show too, and aligned to a row so none is cut off at the top.
  useLayoutEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector('[aria-current="true"]');
    if (!list || !el || list.scrollHeight <= list.clientHeight) return;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top >= lr.top + 8 && er.bottom <= lr.bottom - 8) return;
    const topOf = (node) => list.scrollTop + node.getBoundingClientRect().top - lr.top;
    const centred = topOf(el) - (lr.height - er.height) * 0.58; // a little below the middle: more of what came before shows
    let target = centred;
    let best = Infinity;
    list.querySelectorAll('.mod-ch__head, .mod-vid').forEach((row) => {
      const t = topOf(row);
      if (Math.abs(t - centred) < best) {
        best = Math.abs(t - centred);
        target = t;
      }
    });
    list.scrollTop = Math.max(0, target - 4);
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
                  {chapterLessons(ch).map((info, vi) => {
                    const vid = ch.videos[vi];
                    const current = ci === selC && vi === selV;
                    const seen = Boolean(state.watched[lessonKey(m.id, ci, vi)]);
                    return (
                      <li key={vi}>
                        <Link
                          to={{ search: lessonSearch(ci, vi) }}
                          replace
                          className={cx('mod-vid', current && 'is-current', seen && 'is-watched', info.unavailable && 'is-unavailable')}
                          aria-current={current ? 'true' : undefined}
                          title={info.title.length > 56 ? info.title : undefined}
                          data-hub="lesson-item"
                          data-lesson={`${ci}:${vi}`}
                          onClick={onPick}
                        >
                          <RowThumb video={vid} current={current} seen={seen} />
                          <span className="mod-vid__text">
                            <span className="mod-vid__title">
                              {info.title}
                              {seen ? <span className="visually-hidden"> (watched)</span> : null}
                            </span>
                            <span className="mod-vid__by">
                              {current ? <span className="mod-vid__now">{nowLabel}</span> : null}
                              {info.by ? (
                                <span className={cx('mod-vid__who', info.byKind === 'unavailable' && 'is-note')}>
                                  {info.byKind === 'unavailable' ? <Warning aria-hidden="true" /> : null}
                                  {info.by}
                                </span>
                              ) : null}
                            </span>
                          </span>
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
