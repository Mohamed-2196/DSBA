import { useCallback, useMemo, useState } from 'react';
import { Lightbulb } from '@phosphor-icons/react';
import type { PlayOut, SearchView } from '../../types';
import { useDailyMove } from '../../api';
import { useToast } from '../../../../state/hooks';
import './SearchGameView.css';

interface SearchGameViewProps {
  playOut: PlayOut;
  day: string;
}

interface CellPos {
  row: number;
  col: number;
}

// Compute straight line cells between start and end
function lineCells(start: CellPos, end: CellPos): CellPos[] {
  const dr = end.row - start.row;
  const dc = end.col - start.col;
  if ((dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) || (dr === 0 && dc === 0)) {
    return [start];
  }
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = dr === 0 ? 0 : dr / Math.abs(dr);
  const sc = dc === 0 ? 0 : dc / Math.abs(dc);
  const cells: CellPos[] = [];
  for (let i = 0; i <= steps; i++) {
    cells.push({ row: start.row + sr * i, col: start.col + sc * i });
  }
  return cells;
}

export function SearchGameView({ playOut, day }: SearchGameViewProps) {
  const { play } = playOut;
  const view = play.view as unknown as SearchView;
  const isOver = play.status === 'won' || play.status === 'lost';

  const [startCell, setStartCell] = useState<CellPos | null>(null);
  const [hoverCell, setHoverCell] = useState<CellPos | null>(null);

  const moveMutation = useDailyMove(day, 'search');
  const toast = useToast();

  const grid = view.grid ?? [];
  const words = view.words ?? [];
  const foundWords = useMemo(() => new Set((view.found ?? []).map((f) => f.word)), [view.found]);

  // Set of found cell coordinates "r,c"
  const foundCells = useMemo(() => {
    const set = new Set<string>();
    for (const item of view.found ?? []) {
      const line = lineCells(item.start, item.end);
      for (const c of line) {
        set.add(`${c.row},${c.col}`);
      }
    }
    return set;
  }, [view.found]);

  // Set of hinted cell coordinates "r,c"
  const hintCells = useMemo(() => {
    const set = new Set<string>();
    for (const h of view.hints ?? []) {
      set.add(`${h.row},${h.col}`);
    }
    return set;
  }, [view.hints]);

  // Preview line when dragging / selecting
  const previewCells = useMemo(() => {
    if (!startCell || !hoverCell) return new Set<string>();
    const line = lineCells(startCell, hoverCell);
    return new Set(line.map((c) => `${c.row},${c.col}`));
  }, [startCell, hoverCell]);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (isOver || moveMutation.isPending) return;

      if (!startCell) {
        setStartCell({ row, col });
        setHoverCell({ row, col });
      } else {
        // Ending cell selected
        const dr = row - startCell.row;
        const dc = col - startCell.col;
        const isStraight = (dr === 0 && dc !== 0) || (dc === 0 && dr !== 0) || Math.abs(dr) === Math.abs(dc);

        if (!isStraight || (dr === 0 && dc === 0)) {
          // If clicked the same cell or not a straight line, change start
          setStartCell({ row, col });
          setHoverCell({ row, col });
          return;
        }

        // Valid straight line, submit move
        moveMutation.mutate(
          { kind: 'find', start: startCell, end: { row, col } },
          {
            onSuccess: (updated) => {
              setStartCell(null);
              setHoverCell(null);
              const lastResult = updated.play.result;
              if (lastResult === 'found') {
                toast.push({ tone: 'success', title: 'Word found!' });
              } else {
                toast.push({ tone: 'info', title: 'Not a word in the list' });
              }
            },
            onError: () => {
              setStartCell(null);
              setHoverCell(null);
              toast.push({ tone: 'alert', title: 'Not a word in the list' });
            },
          },
        );
      }
    },
    [isOver, moveMutation, startCell, toast],
  );

  const handleHint = useCallback(() => {
    if (isOver || moveMutation.isPending) return;
    moveMutation.mutate(
      { kind: 'hint' },
      {
        onSuccess: () => {
          toast.push({ tone: 'info', title: 'First letter revealed (-10 pts)' });
        },
      },
    );
  }, [isOver, moveMutation, toast]);

  return (
    <div className="search-container" role="region" aria-label="Word Search Game">
      {/* Words to Find List */}
      <div className="search-words-list" role="list" aria-label="Words to find">
        {words.map((w) => {
          const isFound = foundWords.has(w);
          return (
            <span key={w} className={`search-word-badge ${isFound ? 'found' : ''}`} role="listitem">
              {w}
            </span>
          );
        })}
      </div>

      {/* 10x10 Grid */}
      <div className="search-grid" role="grid" aria-label="Word Search 10 by 10 Grid">
        {grid.map((rowStr, rIdx) =>
          rowStr.split('').map((char, cIdx) => {
            const coordKey = `${rIdx},${cIdx}`;
            const isStart = startCell?.row === rIdx && startCell?.col === cIdx;
            const isPreview = previewCells.has(coordKey);
            const isFound = foundCells.has(coordKey);
            const isHint = hintCells.has(coordKey);

            let cellClass = 'search-cell';
            if (isStart) cellClass += ' start-selected';
            else if (isPreview) cellClass += ' in-preview-line';
            else if (isFound) cellClass += ' found';

            if (isHint) cellClass += ' hint-cell';

            return (
              <button
                key={coordKey}
                type="button"
                className={cellClass}
                onClick={() => handleCellClick(rIdx, cIdx)}
                onMouseEnter={() => {
                  if (startCell) setHoverCell({ row: rIdx, col: cIdx });
                }}
                disabled={isOver}
                aria-label={`Row ${rIdx + 1}, Column ${cIdx + 1}: ${char}`}
              >
                {char}
              </button>
            );
          }),
        )}
      </div>

      {/* Footer controls */}
      <div className="search-footer">
        <div>
          <span>Misses: {view.misses ?? 0}</span>
        </div>

        {!isOver && (
          <button
            type="button"
            className="chip"
            style={{
              padding: '6px 14px',
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
            onClick={handleHint}
            disabled={moveMutation.isPending}
            title="Reveal starting letter of an unfound word (-10 pts)"
          >
            <Lightbulb size={16} />
            <span>Hint</span>
          </button>
        )}
      </div>
    </div>
  );
}
