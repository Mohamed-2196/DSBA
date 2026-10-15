import { useCallback, useEffect, useMemo, useState } from 'react';
import { Backspace } from '@phosphor-icons/react';
import type { PlayOut, WordMark, WordView } from '../../types';
import { useDailyMove } from '../../api';
import { useToast } from '../../../../state/hooks';
import './WordGameView.css';

interface WordGameViewProps {
  playOut: PlayOut;
  day: string;
}

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
];

export function WordGameView({ playOut, day }: WordGameViewProps) {
  const { play } = playOut;
  const view = play.view as WordView;
  const isOver = play.status === 'won' || play.status === 'lost';

  const [currentGuess, setCurrentGuess] = useState('');
  const [shakingRow, setShakingRow] = useState(false);

  const moveMutation = useDailyMove(day, 'word');
  const toast = useToast();

  const length = view.length || 5;
  const maxGuesses = view.maxGuesses || 6;
  const completedRows = useMemo(() => view.rows || [], [view.rows]);
  const currentRowIndex = completedRows.length;

  // Compute best mark for each letter for the on-screen keyboard
  const keyMarks = useMemo(() => {
    const marks: Record<string, WordMark> = {};
    for (const row of completedRows) {
      for (let i = 0; i < row.word.length; i++) {
        const char = row.word[i].toUpperCase();
        const mark = row.marks[i];
        if (marks[char] === 'hit') continue;
        if (mark === 'hit') marks[char] = 'hit';
        else if (mark === 'near') marks[char] = 'near';
        else if (mark === 'miss' && !marks[char]) marks[char] = 'miss';
      }
    }
    return marks;
  }, [completedRows]);

  const triggerShake = useCallback(() => {
    setShakingRow(true);
    setTimeout(() => setShakingRow(false), 500);
  }, []);

  const handleCharInput = useCallback(
    (char: string) => {
      if (isOver || moveMutation.isPending) return;
      if (currentGuess.length < length) {
        setCurrentGuess((prev) => prev + char.toUpperCase());
      }
    },
    [isOver, moveMutation.isPending, currentGuess.length, length],
  );

  const handleBackspace = useCallback(() => {
    if (isOver || moveMutation.isPending) return;
    setCurrentGuess((prev) => prev.slice(0, -1));
  }, [isOver, moveMutation.isPending]);

  const handleSubmit = useCallback(() => {
    if (isOver || moveMutation.isPending) return;
    if (currentGuess.length < length) {
      triggerShake();
      toast.push({ tone: 'alert', title: `Word must be ${length} letters long` });
      return;
    }

    moveMutation.mutate(
      { kind: 'guess', word: currentGuess },
      {
        onSuccess: () => {
          setCurrentGuess('');
        },
        onError: (err: unknown) => {
          triggerShake();
          const message = (err as Error)?.message || 'Not in word list';
          toast.push({ tone: 'alert', title: message });
        },
      },
    );
  }, [isOver, moveMutation, currentGuess, length, triggerShake, toast]);

  // Physical keyboard support
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isOver) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
        return;
      }
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        handleCharInput(e.key);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOver, handleSubmit, handleBackspace, handleCharInput]);

  return (
    <div className="word-game-container" role="region" aria-label="Word Game">
      {/* 6-Row Guess Grid */}
      <div className="word-board" role="grid" aria-label="Guesses Grid">
        {Array.from({ length: maxGuesses }).map((_, rowIndex) => {
          const isCompleted = rowIndex < completedRows.length;
          const isCurrent = rowIndex === currentRowIndex && !isOver;
          const isRowShaking = isCurrent && shakingRow;

          const rowData = isCompleted ? completedRows[rowIndex] : null;

          return (
            <div
              key={rowIndex}
              className={`word-row ${isRowShaking ? 'row-shake' : ''}`}
              role="row"
              aria-label={`Row ${rowIndex + 1}`}
            >
              {Array.from({ length: length }).map((_, colIndex) => {
                let letter = '';
                let tileClass = 'word-tile';

                if (rowData) {
                  letter = rowData.word[colIndex] || '';
                  const mark = rowData.marks[colIndex];
                  tileClass += ` tile-${mark}`;
                } else if (isCurrent) {
                  letter = currentGuess[colIndex] || '';
                  if (letter) tileClass += ' tile-filled';
                }

                return (
                  <div key={colIndex} className={tileClass} role="gridcell" aria-label={letter || 'empty'}>
                    {letter}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Answer banner when lost */}
      {isOver && play.status === 'lost' && view.answer && (
        <div
          style={{
            padding: '12px 20px',
            borderRadius: 'var(--r-control)',
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--line)',
            color: 'var(--ink)',
            fontSize: 'var(--fs-16)',
            fontWeight: 'var(--fw-medium)',
            textAlign: 'center',
          }}
        >
          The secret word was <strong style={{ color: 'var(--cobalt)', letterSpacing: '2px' }}>{view.answer}</strong>
        </div>
      )}

      {/* On-Screen Keyboard */}
      <div className="word-keyboard" role="group" aria-label="Virtual Keyboard">
        {KEYBOARD_ROWS.map((row, rIdx) => (
          <div key={rIdx} className="word-keyboard-row">
            {row.map((key) => {
              if (key === 'ENTER') {
                return (
                  <button
                    key={key}
                    type="button"
                    className="word-key key-wide"
                    onClick={handleSubmit}
                    disabled={isOver || currentGuess.length < length || moveMutation.isPending}
                    aria-label="Submit word"
                  >
                    ENTER
                  </button>
                );
              }
              if (key === 'BACK') {
                return (
                  <button
                    key={key}
                    type="button"
                    className="word-key key-wide"
                    onClick={handleBackspace}
                    disabled={isOver || currentGuess.length === 0 || moveMutation.isPending}
                    aria-label="Backspace"
                  >
                    <Backspace size={20} />
                  </button>
                );
              }

              const mark = keyMarks[key];
              const keyClass = `word-key ${mark ? `key-${mark}` : ''}`;

              return (
                <button
                  key={key}
                  type="button"
                  className={keyClass}
                  onClick={() => handleCharInput(key)}
                  disabled={isOver || moveMutation.isPending}
                  aria-label={`Letter ${key}`}
                >
                  {key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
