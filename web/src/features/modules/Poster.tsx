// Lesson posters. Nothing plays from YouTube or vc.bibf.com until the student presses play, so the poster stands on
// its own: the video's real thumbnail when it loads (class recordings and playlists have none) with only the source
// and a play button on it, since the thumbnail carries its own title; otherwise a plain tile in the module's cohort
// colour with the module, the lesson's title, "Video n of m" and where it loads from.
import { Play } from '@phosphor-icons/react';
import { useMemo, type CSSProperties } from 'react';
import type { ModuleDetail, ModuleSummary, Video } from '../../api/types';
import { videoThumbnailUrl } from '../../lib/modules';
import { cx, moduleArtSrc } from '../../ui';
import { KIND_ICON, KIND_SOURCE, chapterLessons, kindLabel, lessonPosition } from './lessons';
import { useThumbnail } from './thumbs';
import './Poster.css';

const cohortVars = (year: number) => ({ '--mc': `var(--y${year})`, '--mc-on': `var(--on-y${year})` }) as CSSProperties;

/** The big click-to-load poster (a button), in place of the player until play is pressed. */
export function LessonPoster({
  module: m,
  c,
  v,
  isWatched,
  onPlay,
}: {
  module: ModuleDetail;
  c: number;
  v: number;
  isWatched?: (key: string) => boolean;
  onPlay: () => void;
}) {
  const chapter = m.chapters[c];
  const video = chapter.videos[v];
  const count = chapter.videos.length;
  const thumb = videoThumbnailUrl(video);
  const thumbOk = useThumbnail(thumb) === 'ok';
  const KindIcon = KIND_ICON[video.kind];
  const position = lessonPosition(video, v, count);
  const source = KIND_SOURCE[video.kind] ?? 'the original site';
  const info = useMemo(() => chapterLessons(chapter)[v], [chapter, v]);
  const title = info.real ? info.title : chapter.title;
  const subline = [position, info.by].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      className={cx('mod-poster', thumbOk && 'has-thumb')}
      data-theme="dark"
      data-hub="lesson-poster"
      style={cohortVars(m.year)}
      onClick={onPlay}
      aria-label={`Play chapter ${c + 1}${position ? `, ${position.toLowerCase()}` : ''}: ${title}. Loads from ${source}.`}
    >
      {thumbOk && thumb ? (
        <span className="mod-poster__thumb" aria-hidden="true">
          <img src={thumb} alt="" />
        </span>
      ) : null}

      <span className="mod-poster__top" aria-hidden="true">
        {thumbOk ? (
          <span />
        ) : (
          <span className="mod-poster__module">
            {m.unitCode ? <span className="mod-poster__code">{m.unitCode}</span> : null}
            <span className="mod-poster__short">{m.shortName}</span>
          </span>
        )}
        <span className="mod-poster__kind">
          <KindIcon weight="fill" aria-hidden="true" />
          {kindLabel(video)}
        </span>
      </span>

      {thumbOk ? null : (
        <span className="mod-poster__body" aria-hidden="true">
          <span className="mod-poster__chapter">
            {info.real ? `Chapter ${c + 1}: ${chapter.title}` : `Chapter ${c + 1}`}
          </span>
          <span className="mod-poster__title">{title}</span>
          {subline ? <span className="mod-poster__pos">{subline}</span> : null}
        </span>
      )}

      <span className="mod-poster__play" aria-hidden="true">
        <Play weight="fill" />
      </span>

      <span className="mod-poster__foot" aria-hidden="true">
        {count > 1 ? (
          <span className="mod-poster__ticks">
            {chapter.videos.map((_, i) => (
              <span
                key={i}
                className={cx(
                  'mod-poster__tick',
                  i === v && 'is-current',
                  isWatched?.(m.chapters[c].videos[i].id) && 'is-watched',
                )}
              />
            ))}
          </span>
        ) : (
          <span />
        )}
        {thumbOk ? <span /> : <span className="mod-poster__source">Loads from {source} when you press play</span>}
      </span>
    </button>
  );
}

/**
 * Small preview for lesson links (Continue learning, Pick up where you left off): the lesson's own video thumbnail
 * when it loads (YouTube's), otherwise the module's illustration on its cohort tint, with a play badge. Purely visual
 * (aria-hidden): the surrounding link carries the name.
 */
export function MiniPoster({
  module: m,
  video,
  size = 'md',
  className,
}: {
  module: Pick<ModuleSummary, 'unitCode' | 'shortName' | 'year' | 'art'>;
  /** the lesson it opens */
  video: Video | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const thumb = videoThumbnailUrl(video);
  const thumbOk = useThumbnail(thumb) === 'ok';
  const art = moduleArtSrc(m.art);
  return (
    <span
      className={cx('mod-mini', `mod-mini--${size}`, thumbOk && 'has-thumb', className)}
      style={cohortVars(m.year)}
      aria-hidden="true"
    >
      {thumbOk && thumb ? (
        <img className="mod-mini__thumb" src={thumb} alt="" referrerPolicy="no-referrer" decoding="async" />
      ) : art ? (
        <img className="mod-mini__art" src={art} alt="" width={512} height={512} decoding="async" />
      ) : (
        <span className="mod-mini__code">{m.unitCode || m.shortName}</span>
      )}
      <span className="mod-mini__play">
        <Play weight="fill" />
      </span>
    </span>
  );
}
