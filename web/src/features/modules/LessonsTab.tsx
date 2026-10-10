// Lessons tab: the player (click-to-load poster, then the embed) with the lesson's details and controls, beside
// the chapter list. The lesson on screen lives in the URL (?tab=lessons&chapter=<i>&video=<j>).
import { ArrowSquareOut, CalendarBlank, CaretLeft, CaretRight, CheckCircle, Circle, Headphones, Warning, WifiSlash } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ModuleDetail, Video } from '../../api/types';
import { lessonKey, videoThumbnailUrl } from '../../lib/modules';
import { useToast } from '../../state';
import { Button, HubMark, cx } from '../../ui';
import { ChapterList } from './ChapterList';
import { KIND_SOURCE, chapterLessons, chapterPosition, embedSrc, httpsOnly, kindLabel, lessonPosition, openOriginalLabel, sourceHref } from './lessons';
import { LessonPoster } from './Poster';
import { flatLessons, type FlatLesson, type ProgressApi } from './progress';
import { useThumbnail, youtubeLooksBlocked } from './thumbs';
import './Lessons.css';

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const frameVars = (year: number) => ({ '--mc': `var(--y${year})` }) as CSSProperties;

/** Shown for a moment while we check YouTube is reachable (no iframe yet). */
function LessonWaiting({ year, video }: { year: number; video: Video }) {
  return (
    <div className="mod-frame" data-theme="dark" style={frameVars(year)}>
      <div className="mod-frame__loading" role="status">
        <HubMark size={18} animate="loop" tone="current" />
        <span>Loading from {KIND_SOURCE[video.kind] ?? 'the original site'}</span>
      </div>
    </div>
  );
}

/** YouTube didn't answer from this network: say so, and offer the original link. */
function LessonUnreachable({ year, video, onTryAnyway }: { year: number; video: Video; onTryAnyway: () => void }) {
  const primaryRef = useRef<HTMLElement>(null);
  // The poster that had focus is gone; keep keyboard users on the way forward.
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, []);
  const source = sourceHref(video);
  return (
    <div className="mod-frame mod-frame--blocked" data-theme="dark" style={frameVars(year)} role="alert">
      <div className="mod-blocked">
        <WifiSlash weight="duotone" className="mod-blocked__icon" aria-hidden="true" />
        <p className="mod-blocked__title">This video can&rsquo;t load here</p>
        <p className="mod-blocked__body">
          YouTube isn&rsquo;t responding on this network. It may be blocked here, or the video may have moved. Open it on YouTube instead, or try
          again.
        </p>
        <div className="mod-blocked__actions">
          {source ? (
            <Button ref={primaryRef} variant="primary" href={source} trailingIcon={ArrowSquareOut} aria-label={`${openOriginalLabel(video)} (opens in a new tab)`}>
              {openOriginalLabel(video)}
            </Button>
          ) : null}
          <Button onClick={onTryAnyway}>Try loading it here</Button>
        </div>
      </div>
    </div>
  );
}

/** The loaded player: YouTube, YouTube playlists and BigBlueButton class recordings, in an iframe. */
function LessonFrame({ module: m, c, v }: { module: ModuleDetail; c: number; v: number }) {
  const chapter = m.chapters[c];
  const video = chapter.videos[v];
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="mod-frame" data-theme="dark" style={frameVars(m.year)}>
      {!loaded ? (
        <div className="mod-frame__loading" role="status">
          <HubMark size={18} animate="loop" tone="current" />
          <span>Loading from {KIND_SOURCE[video.kind] ?? 'the original site'}</span>
        </div>
      ) : null}
      <iframe
        ref={ref}
        className={cx('mod-frame__iframe', loaded && 'is-loaded')}
        src={embedSrc(video) ?? undefined}
        title={`${m.unitCode || m.name}: ${chapter.title} (${chapterPosition(c, video, v, chapter.videos.length).toLowerCase()})`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

type Stage = 'poster' | 'waiting' | 'blocked' | 'frame';

export function LessonsTab({
  module: m,
  selection,
  progress,
  onSelect,
}: {
  module: ModuleDetail;
  selection: { c: number; v: number };
  progress: ProgressApi;
  onSelect: (c: number, v: number) => void;
}) {
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
  const [waited, setWaited] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const probe = useThumbnail(videoThumbnailUrl(video));

  // YouTube single videos: give the thumbnail probe a moment to answer before loading the iframe.
  useEffect(() => {
    if (!playing || probe !== 'pending') return undefined;
    const t = setTimeout(() => setWaited(key), 2500);
    return () => clearTimeout(t);
  }, [playing, probe, key]);

  let stage: Stage = 'poster';
  if (playing) {
    if (video.kind === 'bbb' || forceLoad) stage = 'frame';
    else if (probe === 'pending' && waited !== key) stage = 'waiting';
    else if (youtubeLooksBlocked()) stage = 'blocked';
    else stage = 'frame';
  }

  const lessons = useMemo(() => flatLessons(m), [m]);
  const infos = useMemo(() => chapterLessons(chapter), [chapter]);
  const info = infos[v];
  const index = lessons.findIndex((l) => l.c === c && l.v === v);
  const prev = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;

  // A lesson counts as opened ("Pick up where you left off") once the student presses play on it. markOpened
  // changes with the progress it writes, so only a new lesson (or pressing play) calls it again.
  const markOpenedRef = useRef(markOpened);
  useEffect(() => {
    markOpenedRef.current = markOpened;
  });
  useEffect(() => {
    if (playing) markOpenedRef.current(m.id, c, v);
  }, [playing, m.id, c, v]);

  const revealPlayer = useCallback(() => {
    requestAnimationFrame(() => {
      const el = playerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 64 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  }, []);

  const go = (l: FlatLesson | null) => {
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
    const ni = next.c === c ? infos[next.v] : chapterLessons(nch)[next.v];
    if (next.c !== c) upNext = `Up next: chapter ${next.c + 1}, ${nch.title}`;
    else if (ni.real) upNext = `Up next: ${next.video.kind === 'bbb' ? `class recording, ${ni.by ?? ''}` : ni.title}`;
    else upNext = `Up next: ${(lessonPosition(next.video, next.v, nch.videos.length) ?? 'the next video').toLowerCase()}`;
  }
  const source = sourceHref(video);
  const audio = httpsOnly(chapter.audioUrl);

  return (
    <div className="mod-lessons">
      <div className="mod-lessons__grid">
        <div className="mod-lessons__main">
          <div className="mod-player" data-hub="lesson-player" ref={playerRef}>
            {stage === 'poster' ? <LessonPoster key={key} module={m} c={c} v={v} isWatched={isWatched} onPlay={() => setPlaying(true)} /> : null}
            {stage === 'waiting' ? <LessonWaiting year={m.year} video={video} /> : null}
            {stage === 'blocked' ? <LessonUnreachable year={m.year} video={video} onTryAnyway={() => setForceLoad(true)} /> : null}
            {stage === 'frame' ? <LessonFrame key={key} module={m} c={c} v={v} /> : null}
          </div>

          <div className="mod-lesson">
            <div className="mod-lesson__head">
              <div className="mod-lesson__text">
                <p className="mod-lesson__pos">
                  {chapterPosition(c, video, v, chapter.videos.length)}
                  {video.kind === 'bbb' ? null : <span className="mod-lesson__kind">{kindLabel(video)}</span>}
                </p>
                <h2 className="mod-lesson__title">{info.real ? info.title : chapter.title}</h2>
                {info.by ? (
                  <p className={cx('mod-lesson__by', info.byKind === 'unavailable' && 'is-note')}>
                    {info.byKind === 'date' ? <CalendarBlank aria-hidden="true" /> : null}
                    {info.byKind === 'unavailable' ? <Warning aria-hidden="true" /> : null}
                    {info.by}
                  </p>
                ) : null}
              </div>
              <Button
                className={cx('mod-watch', watched && 'is-on')}
                aria-pressed={watched}
                leadingIcon={watched ? <CheckCircle weight="fill" /> : <Circle />}
                onClick={() => setWatched(m.id, c, v, !watched)}
                disabled={!progress.ready}
                data-hub="lesson-watched"
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
              {source ? (
                <Button
                  variant="ghost"
                  href={source}
                  trailingIcon={ArrowSquareOut}
                  className="mod-lesson__orig"
                  aria-label={`${openOriginalLabel(video)} (opens in a new tab)`}
                >
                  {openOriginalLabel(video)}
                </Button>
              ) : null}
            </div>

            {audio ? (
              <div className="mod-audio">
                <span className="mod-audio__label">
                  <Headphones weight="duotone" aria-hidden="true" />
                  Chapter audio
                </span>
                <audio controls preload="none" src={audio} className="mod-audio__player">
                  <a href={audio} target="_blank" rel="noopener noreferrer">
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
