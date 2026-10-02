// Lesson posters. Nothing loads from YouTube / vc.bibf.com until the student presses play, so the
// poster has to stand on its own: a dark plot plane in the module's cohort colour, the chapter title,
// "Video n of m", the source, and the lesson's own trace (deterministic per lesson).
// A YouTube thumbnail is layered on top only if it actually loads (blocked in the sandbox; BBB
// recordings and playlists have none).
import { useMemo } from 'react';
import { Play } from '@phosphor-icons/react';
import { lessonKey, videoThumbnailUrl } from '../../data/modules.js';
import { videoTitle } from '../../data/videoTitles.js';
import { cx } from '../../ui';
import { KIND_ICON, KIND_SOURCE, kindLabel, lessonPosition, lessonTrace } from './lessons.js';
import { useThumbnail } from './thumbs.js';
import './Poster.css';

const W = 960;
const H = 540;
const GRID = 40;
// The trace band sits in the lower half; its spike rises to just under the play button.
const TRACE_Y = 296;
const TRACE_H = 168;

// Graph paper: one path, no ids/patterns needed.
const GRID_PATH = (() => {
  let d = '';
  for (let x = GRID; x < W; x += GRID) d += `M${x} 0V${H}`;
  for (let y = GRID; y < H; y += GRID) d += `M0 ${y}H${W}`;
  return d;
})();

/**
 * The big click-to-load poster (a button). Rendered in place of the player until play is pressed.
 * @param m module, c chapter index, v video index, isWatched(key) → bool, onPlay()
 */
export function LessonPoster({ module: m, c, v, isWatched, onPlay }) {
  const chapter = m.chapters[c];
  const video = chapter.videos[v];
  const count = chapter.videos.length;
  const key = lessonKey(m.id, c, v);
  const trace = useMemo(() => lessonTrace(key, { width: W, height: TRACE_H, points: 38, spikeAt: 0.765 }), [key]);
  const thumb = videoThumbnailUrl(video);
  const thumbOk = useThumbnail(thumb) === 'ok';
  const KindIcon = KIND_ICON[video.kind];
  const position = lessonPosition(video, v, count);
  const source = KIND_SOURCE[video.kind] || 'the original site';

  return (
    <button
      type="button"
      className={cx('mod-poster', thumbOk && 'has-thumb')}
      data-theme="dark"
      data-hub="lesson-poster"
      style={{ '--mc': `var(--y${m.year})`, '--mc-on': `var(--on-y${m.year})` }}
      onClick={onPlay}
      aria-label={`Play chapter ${c + 1}${position ? `, ${position.toLowerCase()}` : ''}: ${chapter.title}. Loads from ${source}.`}
    >
      <svg className="mod-poster__plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="mod-poster__grid" d={GRID_PATH} />
        <g transform={`translate(0 ${TRACE_Y})`}>
          <path className="mod-poster__axis" d={`M0 ${TRACE_H * 0.6}H${W}`} />
          <path className="mod-poster__trace" d={trace.d} />
        </g>
      </svg>

      {thumbOk ? (
        <span className="mod-poster__thumb" aria-hidden="true">
          <img src={thumb} alt="" />
        </span>
      ) : null}

      <span className="mod-poster__top" aria-hidden="true">
        <span className="mod-poster__module">
          {m.unitCode ? <span className="mod-poster__code">{m.unitCode}</span> : null}
          <span className="mod-poster__short">{m.shortName}</span>
        </span>
        <span className="mod-poster__kind">
          {KindIcon ? <KindIcon weight="fill" aria-hidden="true" /> : null}
          {kindLabel(video)}
        </span>
      </span>

      <span className="mod-poster__body" aria-hidden="true">
        <span className="mod-poster__chapter">{videoTitle(video) ? `Chapter ${c + 1}: ${chapter.title}` : `Chapter ${c + 1}`}</span>
        <span className="mod-poster__title">{videoTitle(video) || chapter.title}</span>
        {position ? <span className="mod-poster__pos">{position}</span> : null}
      </span>

      <span className="mod-poster__play" aria-hidden="true">
        <Play weight="fill" />
      </span>

      <span className="mod-poster__foot" aria-hidden="true">
        {count > 1 ? (
          <span className="mod-poster__ticks">
            {chapter.videos.map((_, i) => (
              <span
                key={i}
                className={cx('mod-poster__tick', i === v && 'is-current', isWatched?.(lessonKey(m.id, c, i)) && 'is-watched')}
              />
            ))}
          </span>
        ) : (
          <span />
        )}
        <span className="mod-poster__source">Loads from {source} when you press play</span>
      </span>
    </button>
  );
}

/**
 * Small decorative poster for lesson links (Continue learning, Pick up where you left off).
 * Purely visual (aria-hidden): the surrounding link carries the name.
 */
export function MiniPoster({ module: m, c = 0, v = 0, size = 'md', className }) {
  const key = lessonKey(m.id, c, v);
  const trace = useMemo(() => lessonTrace(key, { width: 320, height: 64, points: 18, spikeAt: 0.62, noise: 0.08 }), [key]);
  return (
    <span className={cx('mod-mini', `mod-mini--${size}`, className)} data-theme="dark" style={{ '--mc': `var(--y${m.year})`, '--mc-on': `var(--on-y${m.year})` }} aria-hidden="true">
      <svg className="mod-mini__plot" viewBox="0 0 320 180" preserveAspectRatio="none">
        <path className="mod-mini__grid" d="M40 0V180M80 0V180M120 0V180M160 0V180M200 0V180M240 0V180M280 0V180M0 40H320M0 80H320M0 120H320M0 160H320" />
        <g transform="translate(0 104)">
          <path className="mod-mini__trace" d={trace.d} />
        </g>
      </svg>
      <span className="mod-mini__code">{m.unitCode || m.shortName}</span>
      <span className="mod-mini__play">
        <Play weight="fill" />
      </span>
    </span>
  );
}
