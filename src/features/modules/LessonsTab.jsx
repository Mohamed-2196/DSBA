// Lessons tab: player (click-to-load poster, then the v1 embed) + lesson details and controls, beside
// the chapter list. Lesson selection lives in the URL (?tab=lessons&chapter=<i>&video=<j>).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowSquareOut, CaretLeft, CaretRight, CheckCircle, Circle, Headphones, WifiSlash } from '@phosphor-icons/react';
import { lessonKey, videoSourceUrl, videoThumbnailUrl } from '../../data/modules.js';
import { useToast } from '../../state';
import { Button, PulseMark, cx } from '../../ui';
import { flatLessons } from './progress.js';
import { KIND_SOURCE, chapterPosition, embedSrc, kindLabel, lessonPosition, openOriginalLabel } from './lessons.js';
import { LessonPoster } from './Poster.jsx';
import { useThumbnail, youtubeLooksBlocked } from './thumbs.js';
import { ChapterList } from './ChapterList.jsx';
import './Lessons.css';

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Shown for a moment while we check YouTube is reachable (no iframe yet). */
function LessonWaiting({ module: m, video }) {
  return (
    <div className="mod-frame" data-theme="dark" style={{ '--mc': `var(--y${m.year})` }}>
      <div className="mod-frame__loading" role="status">
        <PulseMark size={18} animate="loop" tone="current" />
        <span>Loading from {KIND_SOURCE[video.kind] || 'the original site'}</span>
      </div>
    </div>
  );
}

/** YouTube didn't answer from this network: say so, and offer the original link. */
function LessonUnreachable({ module: m, video, onTryAnyway }) {
  const primaryRef = useRef(null);
  // The poster that had focus is gone; keep keyboard users on the way forward.
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="mod-frame mod-frame--blocked" data-theme="dark" style={{ '--mc': `var(--y${m.year})` }} role="alert">
      <div className="mod-blocked">
        <WifiSlash weight="duotone" className="mod-blocked__icon" aria-hidden="true" />
        <p className="mod-blocked__title">This video can&rsquo;t load here</p>
        <p className="mod-blocked__body">
          YouTube isn&rsquo;t responding on this network. It may be blocked here, or the video may have moved. Open it on YouTube instead, or try again.
        </p>
        <div className="mod-blocked__actions">
          <Button ref={primaryRef} variant="primary" href={videoSourceUrl(video)} trailingIcon={ArrowSquareOut} aria-label={`${openOriginalLabel(video)} (opens in a new tab)`}>
            {openOriginalLabel(video)}
          </Button>
          <Button onClick={onTryAnyway}>Try loading it here</Button>
        </div>
      </div>
    </div>
  );
}

/** The loaded player: the same iframe URLs v1 embedded (YouTube, YouTube playlists, BigBlueButton). */
function LessonFrame({ module: m, c, v }) {
  const chapter = m.chapters[c];
  const video = chapter.videos[v];
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="mod-frame" data-theme="dark" style={{ '--mc': `var(--y${m.year})` }}>
      {!loaded ? (
        <div className="mod-frame__loading" role="status">
          <PulseMark size={18} animate="loop" tone="current" />
          <span>Loading from {KIND_SOURCE[video.kind] || 'the original site'}</span>
        </div>
      ) : null}
      <iframe
        ref={ref}
        className={cx('mod-frame__iframe', loaded && 'is-loaded')}
        src={embedSrc(video)}
        title={`${m.unitCode || m.name}: ${chapter.title} (${chapterPosition(c, video, v, chapter.videos.length).toLowerCase()})`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

export function LessonsTab({ module: m, selection, progress, onSelect }) {
  const { c, v } = selection;
  const chapter = m.chapters[c];
  const video = chapter.videos[v];
  const key = lessonKey(m.id, c, v);
  const { push } = useToast();
  const { state, isWatched, setWatched, markOpened, resetModule, restore } = progress;
  const watched = isWatched(key);
  // Once the student presses play, moving to another lesson keeps playing (they already chose to load it).
  const [playing, setPlaying] = useState(false);
  // "Try loading it here" holds for the rest of the visit, not just one lesson.
  const [forceLoad, setForceLoad] = useState(false);
  const [waited, setWaited] = useState(null);
  const playerRef = useRef(null);
  const probe = useThumbnail(videoThumbnailUrl(video));

  // YouTube single videos: give the thumbnail probe a moment to answer before loading the iframe.
  useEffect(() => {
    if (!playing || probe !== 'pending') return undefined;
    const t = setTimeout(() => setWaited(key), 2500);
    return () => clearTimeout(t);
  }, [playing, probe, key]);

  let stage = 'poster';
  if (playing) {
    if (video.kind === 'bbb' || forceLoad) stage = 'frame';
    else if (probe === 'pending' && waited !== key) stage = 'waiting';
    else if (youtubeLooksBlocked()) stage = 'blocked';
    else stage = 'frame';
  }

  const lessons = useMemo(() => flatLessons(m), [m]);
  const index = lessons.findIndex((l) => l.c === c && l.v === v);
  const prev = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;

  // A lesson counts as opened ("Pick up where you left off") once the student presses play on it.
  useEffect(() => {
    if (playing) markOpened(m.id, c, v);
  }, [playing, m.id, c, v, markOpened]);

  const revealPlayer = useCallback(() => {
    requestAnimationFrame(() => {
      const el = playerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 64 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  }, []);

  const go = (l) => {
    if (!l) return;
    onSelect(l.c, l.v);
    revealPlayer();
  };

  const onReset = () => {
    const snapshot = resetModule(m.id);
    push({
      title: `Progress cleared for ${m.unitCode || m.shortName}`,
      body: 'Every lesson in this module is marked as not watched.',
      tone: 'info',
      action: { label: 'Undo', onClick: () => restore(snapshot) },
    });
  };

  const nextLabel = next ? (next.c !== c ? 'Next chapter' : `Next ${next.video.kind === 'youtube-playlist' ? 'playlist' : 'video'}`) : 'Next video';
  let upNext = 'This is the last lesson in the module.';
  if (next) {
    const nch = m.chapters[next.c];
    upNext =
      next.c !== c
        ? `Up next: chapter ${next.c + 1}, ${nch.title}`
        : `Up next: ${(lessonPosition(next.video, next.v, nch.videos.length) || 'the next video').toLowerCase()}`;
  }

  return (
    <div className="mod-lessons">
      <div className="mod-lessons__grid">
        <div className="mod-lessons__main">
          <div className="mod-player" data-pulse="lesson-player" ref={playerRef}>
            {stage === 'poster' ? <LessonPoster key={key} module={m} c={c} v={v} isWatched={isWatched} onPlay={() => setPlaying(true)} /> : null}
            {stage === 'waiting' ? <LessonWaiting module={m} video={video} /> : null}
            {stage === 'blocked' ? <LessonUnreachable module={m} video={video} onTryAnyway={() => setForceLoad(true)} /> : null}
            {stage === 'frame' ? <LessonFrame key={key} module={m} c={c} v={v} /> : null}
          </div>

          <div className="mod-lesson">
            <div className="mod-lesson__head">
              <div className="mod-lesson__text">
                <p className="mod-lesson__pos">
                  {chapterPosition(c, video, v, chapter.videos.length)}
                  <span className="mod-lesson__kind">{kindLabel(video)}</span>
                </p>
                <h2 className="mod-lesson__title">{chapter.title}</h2>
              </div>
              <Button
                className={cx('mod-watch', watched && 'is-on')}
                aria-pressed={watched}
                leadingIcon={watched ? <CheckCircle weight="fill" /> : <Circle />}
                onClick={() => setWatched(m.id, c, v, !watched)}
              >
                {watched ? 'Watched' : 'Mark as watched'}
              </Button>
            </div>

            <div className="mod-lesson__nav">
              <div className="mod-lesson__steps">
                <Button leadingIcon={CaretLeft} disabled={!prev} onClick={() => go(prev)}>
                  Previous
                </Button>
                <Button variant="primary" trailingIcon={CaretRight} disabled={!next} onClick={() => go(next)}>
                  {nextLabel}
                </Button>
              </div>
              <p className="mod-lesson__upnext">{upNext}</p>
              <Button variant="ghost" href={videoSourceUrl(video)} trailingIcon={ArrowSquareOut} className="mod-lesson__orig" aria-label={`${openOriginalLabel(video)} (opens in a new tab)`}>
                {openOriginalLabel(video)}
              </Button>
            </div>

            {chapter.audioUrl ? (
              <div className="mod-audio">
                <span className="mod-audio__label">
                  <Headphones weight="duotone" aria-hidden="true" />
                  Chapter audio
                </span>
                <audio controls preload="none" src={chapter.audioUrl} className="mod-audio__player">
                  <a href={chapter.audioUrl} target="_blank" rel="noopener noreferrer">
                    Download the chapter audio
                  </a>
                </audio>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mod-lessons__aside">
          <ChapterList module={m} selection={selection} state={state} nowLabel={stage === 'frame' ? 'Playing' : 'Selected'} onReset={onReset} onPick={revealPlayer} />
        </div>
      </div>
    </div>
  );
}
