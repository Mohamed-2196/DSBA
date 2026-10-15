import { useCallback, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import type { GroupsView, PlayOut } from '../../types';
import { useDailyMove } from '../../api';
import { useToast } from '../../../../state/hooks';
import './GroupsGameView.css';

interface GroupsGameViewProps {
  playOut: PlayOut;
  day: string;
}

export function GroupsGameView({ playOut, day }: GroupsGameViewProps) {
  const { play } = playOut;
  const view = play.view as unknown as GroupsView;
  const isOver = play.status === 'won' || play.status === 'lost';

  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [shuffledOrder, setShuffledOrder] = useState<string[] | null>(null);

  const moveMutation = useDailyMove(day, 'groups');
  const toast = useToast();

  const wordsOnBoard = shuffledOrder ?? view.words ?? [];
  const mistakesLeft = view.mistakesLeft ?? 4;
  const foundGroups = view.found ?? [];

  const handleToggleWord = (word: string) => {
    if (isOver || moveMutation.isPending) return;
    setSelectedWords((prev) => {
      if (prev.includes(word)) {
        return prev.filter((w) => w !== word);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, word];
    });
  };

  const handleShuffle = () => {
    const list = [...wordsOnBoard];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    setShuffledOrder(list);
  };

  const handleDeselect = () => {
    setSelectedWords([]);
  };

  const handleSubmit = useCallback(() => {
    if (isOver || selectedWords.length !== 4 || moveMutation.isPending) return;

    moveMutation.mutate(
      { kind: 'group', words: selectedWords as [string, string, string, string] },
      {
        onSuccess: (updated) => {
          setSelectedWords([]);
          const updatedView = updated.play.view as unknown as GroupsView;
          // Reset shuffle order so newly remaining words stay clean
          setShuffledOrder(null);
          if (updatedView.oneAway) {
            toast.push({ tone: 'info', title: 'One away...' });
          }
        },
        onError: (err: unknown) => {
          const message = (err as Error)?.message || 'Invalid group';
          toast.push({ tone: 'alert', title: message });
        },
      },
    );
  }, [isOver, selectedWords, moveMutation, toast]);

  return (
    <div className="groups-container" role="region" aria-label="Groups Game">
      {/* Banner for One Away */}
      {view.oneAway && !isOver && (
        <div className="groups-banner one-away" role="alert">
          One away...
        </div>
      )}

      {/* Board with Solved Groups + Unsolved Words */}
      <div className="groups-board">
        {/* Solved Groups */}
        {foundGroups.map((group, idx) => (
          <div key={idx} className={`groups-found-card groups-level-${group.level}`}>
            <span className="groups-found-label">{group.label}</span>
            <span className="groups-found-words">{group.words.join(', ')}</span>
          </div>
        ))}

        {/* Unsolved Words Grid */}
        {!isOver && wordsOnBoard.length > 0 && (
          <div className="groups-words-grid" role="group" aria-label="Words to group">
            {wordsOnBoard.map((word) => {
              const isSelected = selectedWords.includes(word);
              return (
                <button
                  key={word}
                  type="button"
                  className={`groups-word-btn ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleToggleWord(word)}
                  disabled={moveMutation.isPending}
                  aria-pressed={isSelected}
                >
                  {word}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Mistakes remaining indicator */}
      {!isOver && (
        <div className="groups-mistakes-row">
          <span>Mistakes remaining:</span>
          <div className="groups-dots" aria-label={`${mistakesLeft} mistakes left`}>
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className="groups-dot"
                style={{
                  opacity: i < mistakesLeft ? 1 : 0.2,
                  backgroundColor: mistakesLeft === 1 ? 'var(--alert)' : 'var(--navy)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!isOver && (
        <div className="groups-actions">
          <button
            type="button"
            className="chip"
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--control-border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--ink)',
              fontWeight: 'var(--fw-medium)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={handleShuffle}
            disabled={moveMutation.isPending}
          >
            <ArrowsClockwise size={16} />
            <span>Shuffle</span>
          </button>

          <button
            type="button"
            className="chip"
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--control-border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--ink)',
              fontWeight: 'var(--fw-medium)',
              cursor: 'pointer',
            }}
            onClick={handleDeselect}
            disabled={selectedWords.length === 0 || moveMutation.isPending}
          >
            Deselect All
          </button>

          <button
            type="button"
            className="button"
            style={{
              padding: '8px 24px',
              borderRadius: 'var(--r-pill)',
              border: 'none',
              backgroundColor: selectedWords.length === 4 ? 'var(--navy)' : 'var(--surface-2)',
              color: selectedWords.length === 4 ? 'var(--cobalt-ink)' : 'var(--ink-3)',
              fontWeight: 'var(--fw-semibold)',
              cursor: selectedWords.length === 4 ? 'pointer' : 'not-allowed',
            }}
            onClick={handleSubmit}
            disabled={selectedWords.length !== 4 || moveMutation.isPending}
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
