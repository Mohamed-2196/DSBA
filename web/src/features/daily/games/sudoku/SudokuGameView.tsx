import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowsCounterClockwise, Eraser, Lightbulb, PencilSimple } from '@phosphor-icons/react';
import type { PlayOut, SudokuDifficulty, SudokuView } from '../../types';
import { useDailyMove } from '../../api';
import './SudokuGameView.css';

interface SudokuGameViewProps {
  playOut: PlayOut;
  day: string;
  variant: SudokuDifficulty | string;
  onVariantChange?: (variant: string) => void;
}

// 0-80 indices helpers
function getRow(idx: number): number {
  return Math.floor(idx / 9);
}

function getCol(idx: number): number {
  return idx % 9;
}

function getBox(idx: number): number {
  return Math.floor(getRow(idx) / 3) * 3 + Math.floor(getCol(idx) / 3);
}

export function SudokuGameView({ playOut, day, variant, onVariantChange }: SudokuGameViewProps) {
  const { play } = playOut;
  const view = play.view as SudokuView;
  const isOver = play.status === 'won' || play.status === 'lost';

  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [pencilMode, setPencilMode] = useState(false);
  const [pencilMarks, setPencilMarks] = useState<Record<number, number[]>>({});
  const [undoStack, setUndoStack] = useState<Array<{ cell: number; marks: number[] }>>([]);

  const moveMutation = useDailyMove(day, 'sudoku', variant);

  const givens = view.givens;
  const filled = view.filled;
  const hinted = useMemo(() => new Set(view.hinted), [view.hinted]);

  // Selected digit to highlight identical digits across grid
  const selectedDigit = useMemo(() => {
    if (selectedCell === null) return null;
    return givens[selectedCell] || filled[selectedCell] || null;
  }, [selectedCell, givens, filled]);

  // Peers of selected cell (same row, col, or box)
  const peerIndices = useMemo(() => {
    if (selectedCell === null) return new Set<number>();
    const row = getRow(selectedCell);
    const col = getCol(selectedCell);
    const box = getBox(selectedCell);
    const peers = new Set<number>();
    for (let i = 0; i < 81; i++) {
      if (i !== selectedCell && (getRow(i) === row || getCol(i) === col || getBox(i) === box)) {
        peers.add(i);
      }
    }
    return peers;
  }, [selectedCell]);

  // Handle number input (either placing or pencil marking)
  const handleDigitInput = useCallback(
    (digit: number) => {
      if (isOver || selectedCell === null || moveMutation.isPending) return;
      // Cannot modify given or already filled cells
      if (givens[selectedCell] !== 0 || filled[selectedCell] !== 0) return;

      if (pencilMode) {
        // Toggle pencil mark
        setPencilMarks((prev) => {
          const current = prev[selectedCell] ?? [];
          const exists = current.includes(digit);
          const next = exists ? current.filter((d) => d !== digit) : [...current, digit].sort();
          setUndoStack((u) => [...u, { cell: selectedCell, marks: current }]);
          return { ...prev, [selectedCell]: next };
        });
      } else {
        // Place digit through API
        moveMutation.mutate(
          { kind: 'place', cell: selectedCell, digit },
          {
            onSuccess: (updated) => {
              const updatedView = updated.play.view as SudokuView;
              // If correct, remove pencil marks for that cell and from peers
              if (updatedView.filled[selectedCell] === digit) {
                setPencilMarks((prev) => {
                  const copy = { ...prev };
                  delete copy[selectedCell];
                  // Remove this digit from peer pencil marks
                  const row = getRow(selectedCell);
                  const col = getCol(selectedCell);
                  const box = getBox(selectedCell);
                  for (let i = 0; i < 81; i++) {
                    if (copy[i] && (getRow(i) === row || getCol(i) === col || getBox(i) === box)) {
                      copy[i] = copy[i].filter((d) => d !== digit);
                    }
                  }
                  return copy;
                });
              }
            },
          },
        );
      }
    },
    [isOver, selectedCell, moveMutation, givens, filled, pencilMode],
  );

  // Erase pencil marks in selected cell
  const handleErase = useCallback(() => {
    if (isOver || selectedCell === null) return;
    if (givens[selectedCell] !== 0 || filled[selectedCell] !== 0) return;
    setPencilMarks((prev) => {
      const current = prev[selectedCell] ?? [];
      if (current.length === 0) return prev;
      setUndoStack((u) => [...u, { cell: selectedCell, marks: current }]);
      const copy = { ...prev };
      delete copy[selectedCell];
      return copy;
    });
  }, [isOver, selectedCell, givens, filled]);

  // Undo pencil mark
  const handleUndo = useCallback(() => {
    if (isOver || undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setPencilMarks((prev) => ({ ...prev, [last.cell]: last.marks }));
    setSelectedCell(last.cell);
  }, [isOver, undoStack]);

  // Request hint
  const handleHint = useCallback(() => {
    if (isOver || moveMutation.isPending) return;
    const cell = selectedCell !== null && givens[selectedCell] === 0 && filled[selectedCell] === 0 ? selectedCell : undefined;
    moveMutation.mutate({ kind: 'hint', cell });
  }, [isOver, moveMutation, selectedCell, givens, filled]);

  // Keyboard navigation and shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isOver) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        handleDigitInput(Number(e.key));
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleErase();
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setPencilMode((p) => !p);
        return;
      }
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        handleHint();
        return;
      }

      // Arrow keys navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        setSelectedCell((curr) => {
          if (curr === null) return 0;
          const r = getRow(curr);
          const c = getCol(curr);
          let nextR = r;
          let nextC = c;
          if (e.key === 'ArrowUp') nextR = (r + 8) % 9;
          if (e.key === 'ArrowDown') nextR = (r + 1) % 9;
          if (e.key === 'ArrowLeft') nextC = (c + 8) % 9;
          if (e.key === 'ArrowRight') nextC = (c + 1) % 9;
          return nextR * 9 + nextC;
        });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOver, handleDigitInput, handleErase, handleUndo, handleHint]);

  return (
    <div className="sudoku-container" role="region" aria-label="Sudoku Game Board">
      {/* Header bar: difficulty and mistakes */}
      <div className="sudoku-header-bar">
        <div className="sudoku-difficulty-selector">
          {!isOver && play.status === 'new' && onVariantChange ? (
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onVariantChange(d)}
                  className={`chip ${variant === d ? 'active' : ''}`}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--r-pill)',
                    border: '1px solid var(--line)',
                    background: variant === d ? 'var(--navy)' : 'var(--surface)',
                    color: variant === d ? 'var(--cobalt-ink)' : 'var(--ink)',
                    fontSize: 'var(--fs-12)',
                    fontWeight: 'var(--fw-medium)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          ) : (
            <span style={{ fontWeight: 'var(--fw-semibold)', textTransform: 'capitalize' }}>
              {view.difficulty} Mode
            </span>
          )}
        </div>

        <div className={`sudoku-mistakes ${play.mistakes > 0 ? 'has-mistakes' : ''}`}>
          <span>Mistakes: {play.mistakes}</span>
        </div>
      </div>

      {/* 9x9 Board */}
      <div className="sudoku-board" role="grid" aria-label="Sudoku 9 by 9 Grid">
        {Array.from({ length: 81 }).map((_, index) => {
          const givenDigit = givens[index];
          const filledDigit = filled[index];
          const digit = givenDigit || filledDigit || 0;
          const isSelected = selectedCell === index;
          const isPeer = selectedCell !== null && peerIndices.has(index);
          const isSameDigit = selectedDigit !== null && digit !== 0 && digit === selectedDigit;
          const isHint = hinted.has(index);
          const isWrong = view.wrong?.cell === index;
          const marks = pencilMarks[index] ?? [];

          let className = 'sudoku-cell';
          if (isSelected) className += ' cell-selected';
          else if (isSameDigit) className += ' cell-same-digit';
          else if (isPeer) className += ' cell-peer';

          if (givenDigit !== 0) className += ' cell-given';
          else if (isHint) className += ' cell-hinted';
          else if (filledDigit !== 0) className += ' cell-filled';

          if (isWrong) className += ' cell-wrong';

          return (
            <div
              key={index}
              role="gridcell"
              tabIndex={0}
              aria-selected={isSelected}
              className={className}
              onClick={() => setSelectedCell(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setSelectedCell(index);
                }
              }}
            >
              {digit !== 0 ? (
                digit
              ) : marks.length > 0 ? (
                <div className="sudoku-pencil-grid" aria-label={`Pencil marks: ${marks.join(', ')}`}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => (
                    <span key={m} className="sudoku-pencil-mark">
                      {marks.includes(m) ? m : ''}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Controls: Tools + Number Pad */}
      <div className="sudoku-controls">
        <div className="sudoku-tools-row">
          <button
            type="button"
            className="sudoku-tool-btn"
            onClick={handleUndo}
            disabled={isOver || undoStack.length === 0}
            title="Undo pencil mark (U)"
          >
            <ArrowsCounterClockwise size={20} />
            <span>Undo</span>
          </button>

          <button
            type="button"
            className="sudoku-tool-btn"
            onClick={handleErase}
            disabled={isOver || selectedCell === null || (givens[selectedCell] !== 0 || filled[selectedCell] !== 0)}
            title="Erase (Backspace)"
          >
            <Eraser size={20} />
            <span>Erase</span>
          </button>

          <button
            type="button"
            className={`sudoku-tool-btn ${pencilMode ? 'active' : ''}`}
            onClick={() => setPencilMode((p) => !p)}
            disabled={isOver}
            title="Toggle Notes / Pencil Mode (P)"
          >
            <PencilSimple size={20} />
            <span>Notes {pencilMode ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            className="sudoku-tool-btn"
            onClick={handleHint}
            disabled={isOver || moveMutation.isPending}
            title="Get a hint (-20 pts) (H)"
          >
            <Lightbulb size={20} />
            <span>Hint</span>
          </button>
        </div>

        {/* 1-9 Number Pad */}
        <div className="sudoku-numpad" role="group" aria-label="Sudoku Digits Keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              className="sudoku-num-btn"
              onClick={() => handleDigitInput(num)}
              disabled={isOver || selectedCell === null}
              aria-label={`Enter digit ${num}`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
