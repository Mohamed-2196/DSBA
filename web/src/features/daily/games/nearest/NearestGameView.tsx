import { useCallback, useMemo, useState } from 'react';
import { Lightbulb, SortAscending, Clock } from '@phosphor-icons/react';
import type { NearestView, PlayOut } from '../../types';
import { useDailyMove } from '../../api';
import { useToast } from '../../../../state/hooks';
import './NearestGameView.css';

interface NearestGameViewProps {
  playOut: PlayOut;
  day: string;
}

function rankBand(rank: number): 'close' | 'warm' | 'cold' {
  if (rank <= 50) return 'close';
  if (rank <= 200) return 'warm';
  return 'cold';
}

export function NearestGameView({ playOut, day }: NearestGameViewProps) {
  const { play } = playOut;
  const view = play.view as unknown as NearestView;
  const isOver = play.status === 'won' || play.status === 'lost';

  const [inputWord, setInputWord] = useState('');
  const [sortBy, setSortBy] = useState<'rank' | 'time'>('rank');

  const moveMutation = useDailyMove(day, 'nearest');
  const toast = useToast();

  const vocabularySize = view.vocabulary ?? 1000;
  const guesses = useMemo(() => view.guesses ?? [], [view.guesses]);

  // Best rank so far
  const bestRank = useMemo(() => {
    if (guesses.length === 0) return null;
    return Math.min(...guesses.map((g) => g.rank));
  }, [guesses]);

  // Closeness percentage for meter: 1 is 100%, vocabularySize is 0%
  const closenessPercent = useMemo(() => {
    if (bestRank === null) return 0;
    // Logarithmic scale so top 200 feels rewarding
    const normalized = Math.max(0, 1 - Math.log(bestRank) / Math.log(vocabularySize));
    return Math.min(100, Math.round(normalized * 100));
  }, [bestRank, vocabularySize]);

  // Displayed guesses list
  const displayedGuesses = useMemo(() => {
    const list = [...guesses];
    if (sortBy === 'rank') {
      return list.sort((a, b) => a.rank - b.rank);
    }
    return list.reverse(); // newest first
  }, [guesses, sortBy]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const word = inputWord.trim().toLowerCase();
      if (!word || isOver || moveMutation.isPending) return;

      moveMutation.mutate(
        { kind: 'guess', word },
        {
          onSuccess: (updated) => {
            setInputWord('');
            const lastGuess = (updated.play.view as unknown as NearestView).guesses.slice(-1)[0];
            if (lastGuess) {
              if (lastGuess.rank === 1) {
                toast.push({ tone: 'success', title: 'You found the secret word!' });
              } else if (lastGuess.rank <= 50) {
                toast.push({ tone: 'info', title: `Getting close! Rank #${lastGuess.rank}` });
              } else if (lastGuess.rank <= 200) {
                toast.push({ tone: 'info', title: `Warm! Rank #${lastGuess.rank}` });
              }
            }
          },
          onError: (err: unknown) => {
            const message = (err as Error)?.message || 'Word not in vocabulary';
            toast.push({ tone: 'alert', title: message });
          },
        },
      );
    },
    [inputWord, isOver, moveMutation, toast],
  );

  const handleHint = useCallback(() => {
    if (isOver || moveMutation.isPending) return;
    moveMutation.mutate(
      { kind: 'hint' },
      {
        onSuccess: () => {
          toast.push({ tone: 'info', title: 'Closer word revealed (-10 pts)' });
        },
      },
    );
  }, [isOver, moveMutation, toast]);

  return (
    <div className="nearest-container" role="region" aria-label="Nearest Neighbor Game">
      {/* Input form */}
      {!isOver && (
        <form className="nearest-input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="nearest-input-field"
            placeholder="Type a word..."
            value={inputWord}
            onChange={(e) => setInputWord(e.target.value)}
            disabled={moveMutation.isPending}
            autoFocus
            aria-label="Guess word"
          />
          <button
            type="submit"
            className="button"
            style={{
              padding: '0 20px',
              borderRadius: 'var(--r-control)',
              border: 'none',
              backgroundColor: 'var(--navy)',
              color: 'var(--cobalt-ink)',
              fontWeight: 'var(--fw-semibold)',
              cursor: 'pointer',
            }}
            disabled={!inputWord.trim() || moveMutation.isPending}
          >
            Guess
          </button>
          <button
            type="button"
            className="chip"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: 'var(--r-control)',
              border: '1px solid var(--control-border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
            onClick={handleHint}
            disabled={moveMutation.isPending}
            title="Reveal a closer word (-10 pts)"
            aria-label="Hint"
          >
            <Lightbulb size={20} />
          </button>
        </form>
      )}

      {/* Answer revealed when over */}
      {isOver && view.answer && (
        <div
          style={{
            padding: '14px 24px',
            borderRadius: 'var(--r-control)',
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--line)',
            color: 'var(--ink)',
            fontSize: 'var(--fs-16)',
            textAlign: 'center',
            width: '100%',
          }}
        >
          The secret word was <strong style={{ color: 'var(--cobalt)', fontSize: 'var(--fs-20)' }}>{view.answer}</strong>
        </div>
      )}

      {/* Closeness meter */}
      {bestRank !== null && (
        <div className="nearest-meter">
          <div className="nearest-meter-header">
            <span>Closest Guess: #{bestRank}</span>
            <span>{closenessPercent}% close</span>
          </div>
          <div className="nearest-meter-track">
            <div
              className={`nearest-meter-fill rank-${rankBand(bestRank)}`}
              style={{ width: `${closenessPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* List sorting toggle */}
      {guesses.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
            {guesses.length} {guesses.length === 1 ? 'guess' : 'guesses'}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className={`chip ${sortBy === 'rank' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--line)',
                backgroundColor: sortBy === 'rank' ? 'var(--navy)' : 'var(--surface)',
                color: sortBy === 'rank' ? 'var(--cobalt-ink)' : 'var(--ink)',
                fontSize: 'var(--fs-12)',
                cursor: 'pointer',
              }}
              onClick={() => setSortBy('rank')}
            >
              <SortAscending size={14} />
              <span>Closest</span>
            </button>
            <button
              type="button"
              className={`chip ${sortBy === 'time' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--line)',
                backgroundColor: sortBy === 'time' ? 'var(--navy)' : 'var(--surface)',
                color: sortBy === 'time' ? 'var(--cobalt-ink)' : 'var(--ink)',
                fontSize: 'var(--fs-12)',
                cursor: 'pointer',
              }}
              onClick={() => setSortBy('time')}
            >
              <Clock size={14} />
              <span>Recent</span>
            </button>
          </div>
        </div>
      )}

      {/* Guesses list */}
      <div className="nearest-guesses-list" role="list" aria-label="Previous guesses">
        {displayedGuesses.map((g, i) => {
          const band = rankBand(g.rank);
          return (
            <div key={`${g.word}-${i}`} className="nearest-guess-row" role="listitem">
              <span className="nearest-guess-word">
                {g.word}
                {g.hint && <span style={{ marginLeft: '6px', fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>(hint)</span>}
              </span>
              <span className={`nearest-guess-rank-pill rank-${band}`}>
                #{g.rank}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
