// Lessons tab: the player (click-to-load poster, then the embed) with the lesson's details and controls, beside
// the chapter list. The lesson on screen lives in the URL (/modules/<id>/lessons/<lesson id>; ?t=245 starts its
// video 245 seconds in). "Take notes" puts the student's notes beside the playing video in place of the chapter list
// (a sheet under it on a phone): the notes take the video's time and take the video back to a time.
import {
  ArrowSquareOut,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Circle,
  Headphones,
  NotePencil,
  Warning,
  WifiSlash,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import type { ModuleDetail, Video } from '../../api/types';
import { videoThumbnailUrl } from '../../lib/modules';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { Button, ErrorBoundary, Spinner, cx } from '../../ui';
import { LessonNotePanel, LessonNotes, lessonVideoStart } from '../notes/public';
import { AddToBoard } from '../board/public';
import { ChapterQuestions } from '../library/public';
import { ChapterList } from './ChapterList';
import {
  KIND_SOURCE,
  chapterLessons,
  chapterPosition,
  embedSrc,
  httpsOnly,
  kindLabel,
  lessonPosition,
  openOriginalLabel,
  sourceHref,
} from './lessons';
import { LessonPoster } from './Poster';
import { flatLessons, type FlatLesson, type ProgressApi } from './progress';
import { ProgressOffer } from './ProgressOffer';
import { useTracking } from './tracking';
import { useThumbnail, youtubeLooksBlocked } from './thumbs';
import { useVideoClock, withClock } from './videoClock';
import './Lessons.css';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const frameVars = (year: number) => ({ '--mc': `var(--y${year})` }) as CSSProperties;

/** Shown for a moment while we check YouTube is reachable (no iframe yet). */
function LessonWaiting({ year, video }: { year: number; video: Video }) {
  return (
    <div className="mod-frame" data-theme="dark" style={frameVars(year)}>
      <div className="mod-frame__loading" role="status">
        <Spinner size={20} />
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
          YouTube isn&rsquo;t responding on this network. It may be blocked here, or the video may have moved. Open it
          on YouTube instead, or try again.
        </p>
        <div className="mod-blocked__actions">
          {source ? (
            <Button
              ref={primaryRef}
              variant="primary"
              href={source}
              trailingIcon={ArrowSquareOut}
              aria-label={`${openOriginalLabel(video)} (opens in a new tab)`}
            >
              {openOriginalLabel(video)}
            </Button>
          ) : null}
          <Button onClick={onTryAnyway}>Try loading it here</Button>
        </div>
      </div>
    </div>
  );
}

/** The loaded player: YouTube, YouTube playlists and BigBlueButton class recordings, in an iframe. A YouTube player
 *  tells its time (videoClock.ts), and starts `start` seconds in when given. */
function LessonFrame({
  module: m,
  c,
  v,
  frameRef: ref,
  start,
}: {
  module: ModuleDetail;
  c: number;
  v: number;
  frameRef: RefObject<HTMLIFrameElement>;
  start: number | null;
}) {
  const chapter = m.chapters[c];
  const video = chapter.videos[v];
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [ref]);
  const src = embedSrc(video);
  return (
    <div className="mod-frame" data-theme="dark" style={frameVars(m.year)}>
      {!loaded ? (
        <div className="mod-frame__loading" role="status">
          <Spinner size={20} />
          <span>Loading from {KIND_SOURCE[video.kind] ?? 'the original site'}</span>
        </div>
      ) : null}
      <iframe
        ref={ref}
        className={cx('mod-frame__iframe', loaded && 'is-loaded')}
        src={src ? withClock(src, window.location.origin, start) : undefined}
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
  const key = m.chapters[c].videos[v].id;
  const { push } = useToast();
  const { me, featureOn } = useAuth();
  const { state, tracking, isWatched, setWatched, markOpened, resetModule, restore } = progress;
  const track = useTracking();
  const watched = isWatched(key);
  const location = useLocation();
  // A time from a note (?t=): the video starts there, at once (the student asked for it).
  const [startAt, setStartAt] = useState<number | null>(() => lessonVideoStart(location.search));
  // Once the student presses play, moving to another lesson keeps playing (they already chose to load it).
  const [playing, setPlaying] = useState(() => startAt !== null);
  // The notes beside the video
  const canNote = !!me && !me.needsProfile && featureOn('notes');
  const [noting, setNoting] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
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
  const clock = useVideoClock(frameRef, stage === 'frame' ? `${key}:${startAt ?? 0}` : null);
  // A time tapped in a note: the playing video goes there; one not loaded yet loads there.
  const { ready: clockReady, seek: clockSeek } = clock;
  const seek = useCallback(
    (seconds: number) => {
      if (clockReady) clockSeek(seconds);
      else {
        setStartAt(seconds);
        setPlaying(true);
      }
    },
    [clockReady, clockSeek],
  );
  const video4notes = useMemo(() => ({ ready: clock.ready, now: clock.now, seek }), [clock.ready, clock.now, seek]);
  // Another lesson starts at its beginning.
  const shownKey = useRef(key);
  useEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    setStartAt(null);
  }, [key]);

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
    if (playing) markOpenedRef.current(m.id, key);
  }, [playing, m.id, key]);

  const revealPlayer = useCallback(() => {
    requestAnimationFrame(() => {
      const el = playerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 64 || r.bottom > window.innerHeight)
        el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  }, []);

  // The notes open beside the video, with the video in sight above them.
  const openNotes = () => {
    setNoting(true);
    // The player sticks under the tabs while the notes are open: scroll until it gets there (a sticky element isn't
    // scrolled into view), at once (the note's cursor taking the focus would stop a smooth scroll half way).
    requestAnimationFrame(() => {
      const el = playerRef.current;
      if (!el) return;
      const by = el.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
      if (Math.abs(by) > 1) window.scrollBy({ top: by, behavior: 'auto' });
    });
  };

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

  const nextLabel = next
    ? next.c !== c
      ? 'Next chapter'
      : `Next ${next.video.kind === 'youtube-playlist' ? 'playlist' : 'video'}`
    : 'Next video';
  let upNext = 'This is the last lesson in the module.';
  if (next) {
    const nch = m.chapters[next.c];
    const ni = next.c === c ? infos[next.v] : chapterLessons(nch)[next.v];
    if (next.c !== c) upNext = `Up next: chapter ${next.c + 1}, ${nch.title}`;
    else if (ni.real) upNext = `Up next: ${next.video.kind === 'bbb' ? `class recording, ${ni.by ?? ''}` : ni.title}`;
    else
      upNext = `Up next: ${(lessonPosition(next.video, next.v, nch.videos.length) ?? 'the next video').toLowerCase()}`;
  }
  const source = sourceHref(video);
  const audio = httpsOnly(chapter.audioUrl);

  return (
    <div className={cx('mod-lessons', noting && 'is-noting')}>
      <div className="mod-lessons__grid">
        <div className="mod-lessons__main">
          <div className="mod-player" data-hub="lesson-player" ref={playerRef}>
            {stage === 'poster' ? (
              <LessonPoster key={key} module={m} c={c} v={v} isWatched={isWatched} onPlay={() => setPlaying(true)} />
            ) : null}
            {stage === 'waiting' ? <LessonWaiting year={m.year} video={video} /> : null}
            {stage === 'blocked' ? (
              <LessonUnreachable year={m.year} video={video} onTryAnyway={() => setForceLoad(true)} />
            ) : null}
            {stage === 'frame' ? (
              <LessonFrame key={`${key}:${startAt ?? 0}`} module={m} c={c} v={v} frameRef={frameRef} start={startAt} />
            ) : null}
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
              <div className="mod-lesson__acts">
                {tracking ? (
                  <Button
                    className={cx('mod-watch', watched && 'is-on')}
                    aria-pressed={watched}
                    leadingIcon={watched ? <CheckCircle weight="fill" size={19} /> : <Circle size={19} />}
                    onClick={() => setWatched(m.id, key, !watched)}
                    disabled={!progress.ready}
                    data-hub="lesson-watched"
                  >
                    {watched ? 'Watched' : 'Mark as watched'}
                  </Button>
                ) : null}
                {canNote && !noting ? (
                  <Button leadingIcon={NotePencil} onClick={openNotes} data-hub="lesson-take-notes">
                    Take notes
                  </Button>
                ) : null}
                {featureOn('board') ? <AddToBoard link={{ type: 'lesson', id: key }} /> : null}
              </div>
            </div>

            {!tracking && progress.ready ? <ProgressOffer onTurnOn={() => track.set(true)} /> : null}

            <div className="mod-lesson__nav">
              <div className="mod-lesson__steps">
                <Button leadingIcon={CaretLeft} disabled={!prev} onClick={() => go(prev)} className="mod-lesson__step">
                  Previous
                </Button>
                <Button
                  variant="primary"
                  trailingIcon={CaretRight}
                  disabled={!next}
                  onClick={() => go(next)}
                  className="mod-lesson__step"
                >
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

            {featureOn('library') && featureOn('library.questions') ? (
              <ChapterQuestions moduleId={m.id} chapterId={chapter.id} />
            ) : null}

            <ErrorBoundary name="LessonNotes" resetKey={key}>
              <LessonNotes moduleId={m.id} lessonId={key} onWriteBeside={openNotes} />
            </ErrorBoundary>
          </div>
        </div>

        {noting ? (
          <div className="mod-lessons__notes">
            <ErrorBoundary name="LessonNotePanel" resetKey={key}>
              <LessonNotePanel
                key={key}
                moduleId={m.id}
                lessonId={key}
                video={video4notes}
                onClose={() => setNoting(false)}
              />
            </ErrorBoundary>
          </div>
        ) : null}
        <div className="mod-lessons__aside">
          <ChapterList
            module={m}
            selection={selection}
            state={state}
            tracking={tracking}
            onTracking={track.set}
            nowLabel={stage === 'frame' ? 'Playing' : 'Selected'}
            onReset={onReset}
            onPick={revealPlayer}
          />
        </div>
      </div>
    </div>
  );
}
