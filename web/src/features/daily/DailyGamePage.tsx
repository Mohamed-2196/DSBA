// A daily puzzle (/daily/:game, or /daily/:day/:game for a past day's practice). The page owns everything around
// the game: the bar (back, name, set number and day, rules, give up), the note when the play won't count, short
// messages over the board, the rules on a first visit, and the result card at the end. On phones it takes the
// whole screen, so the board and its keyboard fit without scrolling; Mini Noora steps away while it's open.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, DotsThreeVertical, Flag, Question, SignIn } from '@phosphor-icons/react';
import { errorMessage, isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { isDayKey, todayKey } from '../../lib/dates';
import { useDocumentTitle, useQueryParam } from '../../state';
import { Button, ConfirmDialog, EmptyState, IconButton, Menu, QueryError, Skeleton, cx } from '../../ui';
import { useMiniNooraAway } from '../noora/public';
import { useDailyMove, useDailyPlay, useDailyToday } from './api';
import { Flash, type FlashMessage, type FlashTone } from './components/Flash';
import { GameTile } from './components/GameGlyph';
import { ResultDialog } from './components/ResultDialog';
import { RulesDialog } from './components/RulesDialog';
import { ShareButton } from './components/ShareButton';
import { GAMES, type MoveResult } from './games/registry';
import { dayLabel, nextToPlay } from './lib/days';
import { HELD, resultOf } from './lib/result';
import { hasSeenRules, markRulesSeen } from './lib/storage';
import { isDifficulty, isGameId, isOver, type DailyToday, type GameId, type Move, type PlayOut } from './types';
import './daily.css';
import './DailyGamePage.css';

export default function DailyGamePage() {
  const params = useParams<{ game: string; day?: string }>();
  useMiniNooraAway();
  if (!isGameId(params.game) || (params.day !== undefined && !isDayKey(params.day))) {
    return (
      <div className="dy dg dg--missing">
        <EmptyState
          title="There’s no such puzzle"
          body="Pick one of today’s puzzles instead."
          action={<Button to="/daily">Go to Daily</Button>}
        />
      </div>
    );
  }
  return (
    <GameScreen key={`${params.day ?? 'today'}:${params.game}`} game={params.game} dayParam={params.day ?? null} />
  );
}

function GameScreen({ game, dayParam }: { game: GameId; dayParam: string | null }) {
  // Without a day in the address, the puzzle is today's as of opening it: a move after midnight stays on it.
  const [day] = useState(() => dayParam ?? todayKey());
  const { me, openSignIn } = useAuth();
  const today = useDailyToday();
  const isToday = day === (today.data?.day ?? todayKey());
  const card = today.data?.games.find((g) => g.info.id === game);

  // Sudoku's difficulty: from the address, else the one you've started today, else easy.
  const [asked, setAsked] = useQueryParam('difficulty');
  const waitForCard = game === 'sudoku' && !isDifficulty(asked) && isToday && today.isPending;
  const variant = game !== 'sudoku' ? '' : isDifficulty(asked) ? asked : (isToday && card?.variant) || 'easy';

  if (waitForCard) return <ScreenSkeleton game={game} />;
  return (
    <PlayScreen
      key={variant}
      game={game}
      day={day}
      variant={variant}
      today={today.data}
      isToday={isToday}
      signedIn={Boolean(me)}
      onSignIn={() => openSignIn()}
      onVariant={(v) => setAsked(v, { replace: true })}
    />
  );
}

interface PlayScreenProps {
  game: GameId;
  day: string;
  variant: string;
  today: DailyToday | undefined;
  isToday: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  onVariant: (variant: string) => void;
}

function PlayScreen({ game, day, variant, today, isToday, signedIn, onSignIn, onVariant }: PlayScreenProps) {
  const query = useDailyPlay(day, game, variant);
  const move = useDailyMove(day, game, variant);
  const out = query.data;
  const plugin = GAMES[game];
  useDocumentTitle(out ? `${out.info.title} #${out.play.number}` : 'Daily');

  // ── Messages over the board ─────────────────────────────────────────────────────────────────
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const flashTimer = useRef<number>();
  const flash = useCallback((text: string, tone: FlashTone = 'info') => {
    window.clearTimeout(flashTimer.current);
    setMessage((m) => ({ id: (m?.id ?? 0) + 1, text, tone }));
    flashTimer.current = window.setTimeout(() => setMessage(null), tone === 'alert' ? 2600 : 1900);
  }, []);

  // ── Dialogs ─────────────────────────────────────────────────────────────────────────────────
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // From the finishing move until its result opens: the game's last animation plays undisturbed.
  const [finishing, setFinishing] = useState(false);
  const paused = rulesOpen || resultOpen || confirmGiveUp || menuOpen;
  const resultTimer = useRef<number>();
  // After a dialog, the keyboard goes back to the game (not to whatever the dialog would fall back on).
  const stage = useRef<HTMLElement>(null);
  const backToGame = () => stage.current?.focus({ preventScroll: true });
  useEffect(
    () => () => {
      window.clearTimeout(resultTimer.current);
      window.clearTimeout(flashTimer.current);
    },
    [],
  );

  // The rules open by themselves the first time a game is opened on this device, before it's started.
  const fresh = out?.play.status === 'new';
  useEffect(() => {
    if (fresh && !hasSeenRules(game)) setRulesOpen(true);
  }, [fresh, game]);
  const closeRules = () => {
    markRulesSeen(game);
    setRulesOpen(false);
    backToGame();
  };

  const { mutateAsync } = move;
  const play = useCallback(
    async (m: Move): Promise<MoveResult> => {
      const before = query.data?.play.status;
      try {
        const next = await mutateAsync(m);
        const delay = m.kind === 'give-up' ? 300 : plugin.resultDelay;
        if (before && !isOver(before) && isOver(next.play.status) && delay !== null) {
          setFinishing(true);
          window.clearTimeout(resultTimer.current);
          resultTimer.current = window.setTimeout(() => {
            setFinishing(false);
            setResultOpen(true);
          }, delay);
        }
        return { ok: true, out: next };
      } catch (e) {
        return { ok: false, code: isApiError(e) ? e.code : null, message: errorMessage(e) };
      }
    },
    [mutateAsync, plugin.resultDelay, query.data?.play.status],
  );

  const giveUp = async () => {
    setConfirmGiveUp(false);
    backToGame();
    const r = await play({ kind: 'give-up' });
    if (!r.ok) flash(r.message, 'alert');
  };

  const status = out?.play.status;
  const over = status ? isOver(status) : false;
  const next = isToday && today ? nextToPlay(today.games, game) : null;
  const scoredVariant =
    isToday && game === 'sudoku' ? today?.games.find((g) => g.info.id === 'sudoku' && g.scored)?.variant : undefined;
  const secret = !signedIn && isToday; // a guest's play of today's set: its answers wait

  const { Component } = plugin;
  return (
    <div className={cx('dy dg', `dg--${game}`, over && 'is-over')} data-game={game}>
      <header className="dg-bar">
        <div className="dg-bar__start">
          <IconButton className="dg-only-phone" label="Back to Daily" icon={ArrowLeft} to="/daily" />
          <Button className="dg-only-wide" variant="ghost" size="sm" leadingIcon={ArrowLeft} to="/daily">
            Daily
          </Button>
        </div>
        <div className="dg-bar__title">
          <GameTile game={game} size={32} className="dg-bar__tile" />
          <div className="dg-bar__names">
            <h1 className="dg-bar__name">{out?.info.title ?? <Skeleton width="7em" />}</h1>
            <p className="dg-bar__meta dy-num">
              {out ? `#${out.play.number} · ` : ''}
              {dayLabel(day, today?.day ?? todayKey())}
            </p>
          </div>
        </div>
        <div className="dg-bar__end">
          <IconButton label="How to play" icon={Question} onClick={() => setRulesOpen(true)} disabled={!out} tooltip />
          <Menu
            align="end"
            label="More"
            onOpenChange={setMenuOpen}
            trigger={<IconButton label="More" icon={DotsThreeVertical} disabled={!out} />}
            items={[
              {
                label: 'Give up and see the answer',
                icon: Flag,
                danger: true,
                disabled: !out || over || status === 'new',
                onSelect: () => setConfirmGiveUp(true),
              },
              ...(over ? [{ label: 'See your result', onSelect: () => setResultOpen(true) }] : []),
            ]}
          />
        </div>
      </header>

      {out && !over ? (
        <Notice out={out} isToday={isToday} signedIn={signedIn} scoredVariant={scoredVariant} onSignIn={onSignIn} />
      ) : null}

      <section ref={stage} tabIndex={-1} className="dg-stage" aria-label={out?.info.title ?? 'Puzzle'}>
        <Flash message={message} />
        {query.isPending ? (
          <StageSkeleton />
        ) : query.isError ? (
          isApiError(query.error) && query.error.code === 'not_out_yet' ? (
            <EmptyState
              title="That day’s puzzles aren’t out yet"
              body="New puzzles come out at midnight in Bahrain."
              action={<Button to="/daily">Go to today’s puzzles</Button>}
            />
          ) : isApiError(query.error) && query.error.status === 422 ? (
            <EmptyState
              title="Your play of this puzzle can’t be shown"
              body="The puzzle changed after you played it."
              action={<Button to="/daily">Go to Daily</Button>}
            />
          ) : (
            <QueryError
              error={query.error}
              title="This puzzle didn’t load"
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          )
        ) : out ? (
          <Component
            key={out.play.revision}
            out={out}
            busy={move.isPending}
            play={play}
            flash={flash}
            paused={paused}
            showResult={() => setResultOpen(true)}
            onVariant={onVariant}
          />
        ) : null}
      </section>

      {out && over && !finishing ? <DoneStrip out={out} secret={secret} onOpen={() => setResultOpen(true)} /> : null}

      {out ? (
        <>
          <RulesDialog open={rulesOpen} onClose={closeRules} info={out.info} />
          <ResultDialog
            open={resultOpen}
            onClose={() => {
              setResultOpen(false);
              backToGame();
            }}
            out={out}
            signedIn={signedIn}
            secret={secret}
            streak={isToday ? (today?.streak ?? null) : null}
            next={next}
            onSignIn={onSignIn}
          />
          <ConfirmDialog
            open={confirmGiveUp}
            onClose={() => {
              setConfirmGiveUp(false);
              backToGame();
            }}
            onConfirm={() => void giveUp()}
            title="Give up?"
            body="The puzzle ends now and shows you the answer. You keep the points it has earned."
            confirmLabel="Give up"
            tone="danger"
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * A line over the board: why the play started again when a fix to today's puzzle restarted it (until the next move);
 * otherwise why it won't count, when it won't: a guest's isn't kept, a past day's is practice, and so is a second
 * Sudoku.
 */
function Notice({
  out,
  isToday,
  signedIn,
  scoredVariant,
  onSignIn,
}: {
  out: PlayOut;
  isToday: boolean;
  signedIn: boolean;
  scoredVariant: string | undefined;
  onSignIn: () => void;
}) {
  if (out.play.restarted) {
    return (
      <p className="dg-notice" role="status">
        <span>We fixed a mistake in today’s puzzle, so your game started again.</span>
      </p>
    );
  }
  if (!signedIn) {
    return (
      <p className="dg-notice">
        <span>Your points aren’t kept as a guest.</span>
        <Button variant="ghost" size="sm" leadingIcon={SignIn} onClick={onSignIn}>
          Sign in
        </Button>
      </p>
    );
  }
  if (out.play.scored) return null;
  const why = !isToday
    ? 'Practice: puzzles from past days don’t count for points.'
    : scoredVariant && scoredVariant !== out.play.variant
      ? `Practice: today’s Sudoku points come from your ${scoredVariant} puzzle.`
      : 'Practice: this play doesn’t count for points.';
  return (
    <p className="dg-notice">
      <span>{why}</span>
    </p>
  );
}

/** Under a finished play: what it came to, with the result card and sharing a tap away. */
function DoneStrip({ out, secret, onOpen }: { out: PlayOut; secret: boolean; onOpen: () => void }) {
  const result = resultOf(out.play, secret);
  return (
    <footer className="dg-done dy-rise">
      <div className="dg-done__text">
        <p className="dg-done__headline">{result.headline}</p>
        <p className="dg-done__summary">
          {result.summary}
          {result.answer ? <strong> {result.answer}</strong> : null}
          {out.play.scored && out.play.points > 0 ? <span className="dy-num"> · +{out.play.points} points</span> : null}
        </p>
        {result.held ? <p className="dg-done__held">{HELD}</p> : null}
      </div>
      <div className="dg-done__actions">
        <Button variant="secondary" onClick={onOpen}>
          Result
        </Button>
        {out.play.share ? <ShareButton share={out.play.share} /> : null}
      </div>
    </footer>
  );
}

function StageSkeleton() {
  return (
    <div className="dg-skeleton" aria-busy="true">
      <span className="visually-hidden">Loading the puzzle</span>
      <Skeleton width="min(360px, 90%)" height="min(360px, 50vh)" radius="var(--r-panel)" />
      <Skeleton width="min(480px, 95%)" height={120} radius="var(--r-panel)" />
    </div>
  );
}

function ScreenSkeleton({ game }: { game: GameId }) {
  return (
    <div className={cx('dy dg', `dg--${game}`)}>
      <header className="dg-bar">
        <div className="dg-bar__start" />
        <div className="dg-bar__title">
          <GameTile game={game} size={32} className="dg-bar__tile" />
          <Skeleton width="8em" />
        </div>
        <div className="dg-bar__end" />
      </header>
      <section className="dg-stage" aria-label="Puzzle">
        <StageSkeleton />
      </section>
    </div>
  );
}
