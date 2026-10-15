import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Flag, Info, ShareNetwork } from '@phosphor-icons/react';
import { Button, ConfirmDialog, QueryError, Skeleton } from '../../ui';
import { useDailyMove, useDailyPlay, useDailyToday } from './api';
import { getGamePlugin } from './games/registry';
import { HowToModal } from './components/HowToModal';
import { ShareModal } from './components/ShareModal';
import type { GameId } from './types';

export default function DailyGamePage() {
  const { game: gameParam, day: dayParam } = useParams<{ game: string; day?: string }>();
  const gameId = (gameParam ?? 'word') as GameId;

  // If no day specified in URL, use today from useDailyToday
  const { data: todayData } = useDailyToday();
  const day = dayParam || todayData?.day || new Date().toISOString().slice(0, 10);

  const [variant, setVariant] = useState(gameId === 'sudoku' ? 'medium' : '');
  const [showHowTo, setShowHowTo] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showGiveUpConfirm, setShowGiveUpConfirm] = useState(false);

  const plugin = getGamePlugin(gameId);
  const { data: playOut, isLoading, error, refetch } = useDailyPlay(day, gameId, variant);
  const moveMutation = useDailyMove(day, gameId, variant);

  if (!plugin) {
    return (
      <div style={{ padding: 'var(--content-pad)', textAlign: 'center' }}>
        <h2>Game not found</h2>
        <Link to="/daily">Back to Daily</Link>
      </div>
    );
  }

  const { Component, title, icon: GameIcon } = plugin;
  const isOver = playOut?.play.status === 'won' || playOut?.play.status === 'lost';

  const handleGiveUp = () => {
    moveMutation.mutate(
      { kind: 'give-up' },
      {
        onSuccess: () => {
          setShowGiveUpConfirm(false);
        },
      },
    );
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--content-pad) 16px', display: 'flex', flexDirection: 'column', gap: 'var(--sp-20)' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-12)' }}>
        <Link
          to="/daily"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--ink-2)',
            textDecoration: 'none',
            fontSize: 'var(--fs-14)',
            fontWeight: 'var(--fw-medium)',
          }}
        >
          <ArrowLeft size={18} />
          <span>Daily Hub</span>
        </Link>

        {/* Action icons: How to play, Give up, Share */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {playOut && (
            <button
              type="button"
              className="chip"
              onClick={() => setShowHowTo(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--line)',
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
                fontSize: 'var(--fs-13)',
                cursor: 'pointer',
              }}
              title="How to play"
            >
              <Info size={16} />
              <span>Rules</span>
            </button>
          )}

          {!isOver && playOut?.play.status === 'playing' && (
            <button
              type="button"
              className="chip"
              onClick={() => setShowGiveUpConfirm(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--line)',
                backgroundColor: 'var(--surface)',
                color: 'var(--alert)',
                fontSize: 'var(--fs-13)',
                cursor: 'pointer',
              }}
              title="Give up and see answer"
            >
              <Flag size={16} />
              <span>Give up</span>
            </button>
          )}

          {isOver && (
            <button
              type="button"
              className="chip"
              onClick={() => setShowShare(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--cobalt)',
                backgroundColor: 'var(--cobalt-soft)',
                color: 'var(--cobalt)',
                fontSize: 'var(--fs-13)',
                fontWeight: 'var(--fw-semibold)',
                cursor: 'pointer',
              }}
              title="Share result"
            >
              <ShareNetwork size={16} />
              <span>Share</span>
            </button>
          )}
        </div>
      </div>

      {/* Game Title & Theme Subtitle */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: 'var(--r-control)',
              backgroundColor: 'var(--navy)',
              color: 'var(--cobalt-ink)',
            }}
          >
            <GameIcon size={20} />
          </div>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-25)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
            {title}
          </h1>
        </div>

        {playOut && (
          <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
            Theme: <strong>{playOut.theme.title}</strong> • {playOut.play.day}
            {!playOut.play.scored && (
              <span style={{ marginLeft: '6px', color: 'var(--ink-3)' }}>(Practice Mode)</span>
            )}
          </p>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-12)', padding: 'var(--sp-24)' }}>
          <Skeleton style={{ height: '320px', borderRadius: 'var(--r-panel)' }} />
        </div>
      )}

      {error && (
        <QueryError
          title="Could not load daily puzzle"
          error={error}
          onRetry={() => refetch()}
        />
      )}

      {playOut && (
        <>
          <Component
            playOut={playOut}
            day={day}
            variant={variant}
            onVariantChange={setVariant}
          />

          {/* End of game banner */}
          {isOver && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--sp-12)',
                padding: 'var(--sp-20)',
                borderRadius: 'var(--r-panel)',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--line)',
                textAlign: 'center',
                marginTop: 'var(--sp-12)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 'var(--fs-20)', color: 'var(--ink)' }}>
                {playOut.play.status === 'won' ? '🎉 Great Job!' : 'Better luck tomorrow!'}
              </h3>
              <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--ink-2)' }}>
                You earned <strong>{playOut.play.points} points</strong>
                {!playOut.play.scored && ' (practice)'}.
              </p>
              <div style={{ display: 'flex', gap: 'var(--sp-12)', marginTop: 'var(--sp-4)' }}>
                <Button variant="primary" onClick={() => setShowShare(true)}>
                  Share Result
                </Button>
                <Link to="/daily">
                  <Button variant="secondary">
                    Back to Hub
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Modals */}
          <HowToModal
            open={showHowTo}
            onClose={() => setShowHowTo(false)}
            info={playOut.info}
          />

          <ShareModal
            open={showShare}
            onClose={() => setShowShare(false)}
            play={playOut.play}
            theme={playOut.theme}
            gameTitle={title}
          />

          <ConfirmDialog
            open={showGiveUpConfirm}
            onClose={() => setShowGiveUpConfirm(false)}
            onConfirm={handleGiveUp}
            title="Give up this puzzle?"
            body="Are you sure you want to surrender? This puzzle will be marked as lost and the answer will be shown."
            confirmLabel="Give up"
            tone="danger"
          />
        </>
      )}
    </div>
  );
}
