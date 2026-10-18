// Sudoku: pick a cell, then a digit. Every digit is checked by the server (a wrong one shows in red and counts as a
// mistake); pencil marks, erasing and undoing them stay on this device. The pad shows how many of each digit are
// left. Easy, medium and hard are each a play of their own: the first one started today counts.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowCounterClockwise, Eraser, Lightbulb, PencilSimple } from '@phosphor-icons/react';
import { todayKey } from '../../../../lib/dates';
import { SegmentedControl, cx } from '../../../../ui';
import { loadNotes, saveNotes, type Notes } from '../../lib/storage';
import {
  arePeers,
  boxOf,
  colOf,
  digitsOf,
  firstEmpty,
  leftToPlace,
  placeInNotes,
  rowOf,
  step,
  toggleNote,
} from '../../lib/sudoku';
import { DIFFICULTIES, type SudokuDifficulty } from '../../types';
import type { GameProps } from '../registry';
import './SudokuGame.css';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const LABEL: Record<SudokuDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const typingInto = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function SudokuGame({ out, busy, play, flash, paused, onVariant }: GameProps) {
  const { play: state } = out;
  const view = state.view.kind === 'sudoku' ? state.view : null;
  const givens = view?.givens ?? Array<number>(81).fill(0);
  const filled = view?.filled ?? Array<number>(81).fill(0);
  const hinted = new Set(view?.hinted ?? []);
  const difficulty = view?.difficulty ?? 'easy';
  const over = state.status === 'won' || state.status === 'lost';
  const digits = digitsOf(givens, filled);
  const left = leftToPlace(digits);

  const [selected, setSelected] = useState<number>(() => firstEmpty(digits));
  const [noting, setNoting] = useState(false);
  const [notes, setNotesState] = useState<Notes>(() => loadNotes(state.day, difficulty));
  const [undo, setUndo] = useState<Notes[]>([]);
  const [wave, setWave] = useState<number | null>(null); // the last cell of a solved grid: the board ripples out from it
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const setNotes = (next: Notes, keepUndo = true) => {
    if (keepUndo) setUndo((u) => [...u.slice(-99), notes]);
    setNotesState(next);
    saveNotes(state.day, difficulty, next, todayKey());
  };

  const wrong = view?.wrong && !digits[view.wrong.cell] ? view.wrong : null;
  const selectedDigit = digits[selected] || null;
  const editable = (cell: number) => !over && digits[cell] === 0;

  const select = (cell: number, focus = false) => {
    setSelected(cell);
    if (focus) cells.current[cell]?.focus();
  };

  const enter = async (digit: number) => {
    if (busy || over) return;
    if (!editable(selected)) {
      if (!digits[selected]) return;
      flash('Pick an empty cell first', 'info');
      return;
    }
    if (noting) {
      setNotes(toggleNote(notes, selected, digit));
      return;
    }
    const cell = selected;
    const r = await play({ kind: 'place', cell, digit });
    if (!r.ok) {
      flash(r.message, 'alert');
      return;
    }
    if (r.out.play.result === 'correct') {
      setNotes(placeInNotes(notes, cell, digit), false);
      if (r.out.play.status === 'won') {
        if (!calm()) setWave(cell);
        flash('Solved', 'good');
      }
    } else if (r.out.play.result === 'wrong') {
      flash(`${digit} doesn’t go there`, 'alert');
    }
  };

  const erase = () => {
    if (!editable(selected) || !notes[selected]?.length) return;
    const next = { ...notes };
    delete next[selected];
    setNotes(next);
  };

  const undoNote = () => {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    setNotesState(last);
    saveNotes(state.day, difficulty, last, todayKey());
  };

  const hint = async () => {
    if (busy || over) return;
    const r = await play({ kind: 'hint', cell: editable(selected) ? selected : null });
    if (!r.ok) {
      flash(r.message, 'alert');
      return;
    }
    const after = r.out.play.view;
    if (after.kind !== 'sudoku') return;
    const cell = after.hinted[after.hinted.length - 1];
    if (cell !== undefined) {
      setSelected(cell);
      const digit = after.filled[cell] ?? 0;
      setNotes(placeInNotes(notes, cell, digit), false);
      if (r.out.play.status === 'won') {
        if (!calm()) setWave(cell);
        flash('Solved', 'good');
      }
    }
  };

  // The computer's keyboard: digits, arrows, Backspace, N for notes, Ctrl or ⌘+Z to undo a note.
  const handler = useRef<(e: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    handler.current = (e: KeyboardEvent) => {
      if (e.altKey || e.isComposing || typingInto(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoNote();
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      const moved = step(selected, e.key);
      if (moved !== null) {
        e.preventDefault();
        select(moved, true);
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        void enter(Number(e.key));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        erase();
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setNoting((n) => !n);
      }
    };
  });
  useEffect(() => {
    if (paused || over) return undefined;
    const onKey = (e: KeyboardEvent) => handler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, over]);

  const boxes = Array.from({ length: 9 }, (_, b) =>
    Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)),
  );

  return (
    <div className="dsu">
      <div className="dsu-top">
        <SegmentedControl
          label="Difficulty"
          size="sm"
          value={difficulty}
          onChange={(v) => onVariant(v)}
          options={DIFFICULTIES.map((d) => ({ value: d, label: LABEL[d] }))}
        />
        <p className="dsu-stats dy-num">
          <span className={cx(state.mistakes > 0 && 'has-mistakes')} key={`m${state.mistakes}`}>
            {state.mistakes} {state.mistakes === 1 ? 'mistake' : 'mistakes'}
          </span>
          <span>
            {state.hints} {state.hints === 1 ? 'hint' : 'hints'}
          </span>
        </p>
      </div>

      <div className="dsu-board-wrap">
        <div className={cx('dsu-board', wave !== null && 'is-solved')} role="grid" aria-label={`Sudoku, ${difficulty}`}>
          {boxes.map((box, b) => (
            <div key={b} className="dsu-box" role="presentation">
              {box.map((cell) => {
                const given = givens[cell] ?? 0;
                const digit = digits[cell] ?? 0;
                const isWrong = wrong?.cell === cell;
                const cellNotes = digit ? [] : (notes[cell] ?? []);
                const distance =
                  wave === null ? 0 : Math.abs(rowOf(cell) - rowOf(wave)) + Math.abs(colOf(cell) - colOf(wave));
                return (
                  <button
                    key={cell}
                    ref={(el) => {
                      cells.current[cell] = el;
                    }}
                    type="button"
                    role="gridcell"
                    tabIndex={cell === selected ? 0 : -1}
                    aria-selected={cell === selected}
                    aria-label={cellLabel(
                      cell,
                      given,
                      digit,
                      hinted.has(cell),
                      cellNotes,
                      isWrong ? wrong.digit : null,
                    )}
                    className={cx(
                      'dsu-cell',
                      given ? 'is-given' : digit ? (hinted.has(cell) ? 'is-hinted' : 'is-placed') : '',
                      cell === selected && 'is-selected',
                      cell !== selected && arePeers(cell, selected) && 'is-peer',
                      cell !== selected && selectedDigit !== null && digit === selectedDigit && 'is-same',
                      isWrong && 'is-wrong',
                    )}
                    style={wave !== null ? ({ '--d': distance } as CSSProperties) : undefined}
                    onClick={() => select(cell)}
                  >
                    {digit ? (
                      <span className="dsu-digit">{digit}</span>
                    ) : isWrong ? (
                      <span className="dsu-digit">{wrong.digit}</span>
                    ) : cellNotes.length ? (
                      <span className="dsu-notes" aria-hidden="true">
                        {DIGITS.map((d) => (
                          <span key={d} className={cx(selectedDigit === d && 'is-same')}>
                            {cellNotes.includes(d) ? d : ''}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {!over ? (
        <div className="dsu-controls">
          <div className="dsu-tools">
            <button type="button" className="dsu-tool" onClick={undoNote} disabled={!undo.length}>
              <ArrowCounterClockwise aria-hidden="true" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="dsu-tool"
              onClick={erase}
              disabled={!editable(selected) || !notes[selected]?.length}
            >
              <Eraser aria-hidden="true" />
              <span>Erase</span>
            </button>
            <button
              type="button"
              className={cx('dsu-tool', noting && 'is-on')}
              onClick={() => setNoting((n) => !n)}
              aria-pressed={noting}
            >
              <PencilSimple aria-hidden="true" />
              <span>Notes {noting ? 'on' : 'off'}</span>
            </button>
            <button type="button" className="dsu-tool" onClick={() => void hint()} disabled={busy}>
              <Lightbulb aria-hidden="true" />
              <span>Hint</span>
            </button>
          </div>
          <div className={cx('dsu-pad', noting && 'is-noting')} role="group" aria-label={noting ? 'Notes' : 'Digits'}>
            {DIGITS.map((d) => (
              <button
                key={d}
                type="button"
                className="dsu-key"
                onClick={() => void enter(d)}
                disabled={busy || (left[d] === 0 && !noting)}
                aria-label={`${noting ? 'Note' : 'Place'} ${d}, ${left[d]} left`}
                onMouseDown={(e) => e.preventDefault()} // the board keeps the focus
              >
                <span className="dsu-key__digit">{d}</span>
                <span className="dsu-key__left" aria-hidden="true">
                  {left[d] ? left[d] : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function cellLabel(
  cell: number,
  given: number,
  digit: number,
  hint: boolean,
  notes: number[],
  wrong: number | null,
): string {
  const where = `Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}, box ${boxOf(cell) + 1}`;
  if (given) return `${where}: ${given}, given`;
  if (digit) return `${where}: ${digit}${hint ? ', from a hint' : ''}`;
  if (wrong) return `${where}: empty, ${wrong} was wrong`;
  return notes.length ? `${where}: empty, notes ${notes.join(' ')}` : `${where}: empty`;
}

/** The rules' example: the tools. */
export function SudokuExample() {
  return (
    <ul className="dsu-eg">
      <li>
        <PencilSimple aria-hidden="true" />
        <span>
          <strong>Notes</strong> pencil in the digits a cell might take. They don’t count as moves.
        </span>
      </li>
      <li>
        <Eraser aria-hidden="true" />
        <span>
          <strong>Erase</strong> clears a cell’s notes, and <strong>Undo</strong> takes back the last change to them.
        </span>
      </li>
      <li>
        <Lightbulb aria-hidden="true" />
        <span>
          <strong>Hint</strong> fills the cell you’ve picked, or the most useful one.
        </span>
      </li>
    </ul>
  );
}
