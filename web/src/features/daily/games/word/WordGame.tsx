// The Word: six tries at the week's five-letter word. Letters go in from the on-screen keyboard or the computer's;
// each guess flips its tiles one by one to show its marks, and the keyboard takes the colours once they're shown.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Backspace } from '@phosphor-icons/react';
import { cx } from '../../../../ui';
import type { GameProps } from '../registry';
import { KEY_ROWS, MARK_LABEL, keyMarks, praise } from '../../lib/word';
import type { WordMark, WordRow } from '../../types';
import './WordGame.css';

const FLIP_STEP = 220; // ms between tiles
const FLIP = 500;
const REVEAL = FLIP_STEP * 4 + FLIP;
const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const typingInto = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function WordGame({ out, busy, play, flash, paused }: GameProps) {
  const { play: state } = out;
  const view = state.view.kind === 'word' ? state.view : null;
  const rows = view?.rows ?? [];
  const length = view?.length ?? 5;
  const tries = view?.maxGuesses ?? 6;
  const over = state.status === 'won' || state.status === 'lost';

  const [typed, setTyped] = useState('');
  const [shake, setShake] = useState({ n: 0, on: false });
  const [revealing, setRevealing] = useState<number | null>(null);
  const [cheering, setCheering] = useState<number | null>(null);
  const [said, setSaid] = useState('');
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  // The keyboard shows a guess's colours once its tiles have turned.
  const shown = revealing === null ? rows : rows.slice(0, revealing);
  const marks = keyMarks(shown);

  const refuse = (message: string) => {
    setShake((s) => ({ n: s.n + 1, on: true }));
    later(() => setShake((s) => ({ ...s, on: false })), 450);
    flash(message, 'alert');
  };

  const submit = async () => {
    if (over || busy || revealing !== null) return;
    if (typed.length < length) {
      refuse(typed.length ? 'Not enough letters' : 'Type a five-letter word');
      return;
    }
    const r = await play({ kind: 'guess', word: typed });
    if (!r.ok) {
      refuse(r.message);
      return;
    }
    const after = r.out.play.view;
    if (after.kind !== 'word') return;
    const index = after.rows.length - 1;
    const row = after.rows[index];
    setTyped('');
    setSaid(row ? spoken(row) : '');
    const quick = calm();
    if (!quick) {
      setRevealing(index);
      later(() => setRevealing(null), REVEAL);
    }
    const settle = quick ? 0 : REVEAL;
    if (r.out.play.status === 'won') {
      later(() => {
        if (!quick) setCheering(index);
        flash(praise(after.rows.length), 'good');
      }, settle);
    } else if (r.out.play.status === 'lost' && after.answer) {
      const answer = after.answer;
      later(() => flash(answer, 'info'), settle);
    }
  };

  const press = (key: string) => {
    if (over || busy) return;
    // Letters can go in while a guess turns over; the next guess waits for it.
    if (key === 'Enter') void submit();
    else if (key === 'Backspace') setTyped((t) => t.slice(0, -1));
    else if (/^[A-Z]$/.test(key)) setTyped((t) => (t.length < length ? t + key : t));
  };

  // The computer's keyboard, while nothing else wants it.
  const pressRef = useRef(press);
  useLayoutEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    if (paused || over) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || typingInto(e.target)) return;
      if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) return; // a focused button handles its own Enter
      const key = e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key.length === 1 ? e.key.toUpperCase() : '';
      if (!key || (key.length === 1 && !/^[A-Z]$/.test(key))) return;
      e.preventDefault();
      pressRef.current(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, over]);

  const current = over ? -1 : rows.length;
  return (
    <div className="dw">
      <div className="dw-board-wrap">
        <div className="dw-board" role="grid" aria-label={`Guesses: ${rows.length} of ${tries}`} aria-readonly="true">
          {Array.from({ length: tries }, (_, r) => {
            const row = rows[r];
            const letters = row ? row.word : r === current ? typed : '';
            return (
              <div
                key={r === current ? `typing-${shake.n}` : r}
                role="row"
                aria-label={row ? spoken(row) : r === current ? `Typing: ${typed.split('').join(' ') || 'nothing yet'}` : `Row ${r + 1}, empty`}
                className={cx('dw-row', r === current && shake.on && 'is-shaking', cheering === r && 'is-cheering')}
              >
                {Array.from({ length }, (_, i) => {
                  const letter = letters[i] ?? '';
                  const mark = row?.marks[i];
                  return (
                    <span
                      key={i}
                      role="gridcell"
                      aria-hidden="true"
                      className={cx('dw-tile', letter && 'is-filled', mark && `is-${mark}`, revealing === r && 'is-turning')}
                      style={{ '--i': i } as CSSProperties}
                    >
                      {letter}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {said}
      </p>

      <div className={cx('dw-keys', over && 'is-over')} role="group" aria-label="Keyboard">
        {KEY_ROWS.map((keys, i) => (
          <div key={i} className="dw-keys__row">
            {keys.map((key) => {
              const mark: WordMark | undefined = marks[key];
              const wide = key === 'Enter' || key === 'Backspace';
              return (
                <button
                  key={key}
                  type="button"
                  className={cx('dw-key', wide && 'dw-key--wide', mark && `is-${mark}`)}
                  onClick={() => press(key)}
                  onMouseDown={(e) => e.preventDefault()} // a click leaves the focus where it was: Enter stays a guess
                  disabled={over}
                  aria-label={key === 'Backspace' ? 'Delete letter' : key === 'Enter' ? 'Guess' : mark ? `${key}, ${MARK_LABEL[mark]}` : key}
                >
                  {key === 'Backspace' ? <Backspace size={22} aria-hidden="true" /> : key === 'Enter' ? 'Enter' : key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A guess as a screen reader says it: 'TREND: T in the word, in this spot; R not in the word; …'. */
function spoken(row: WordRow): string {
  return `${row.word}: ${[...row.word].map((l, i) => `${l} ${MARK_LABEL[row.marks[i] ?? 'miss']}`).join('; ')}`;
}

/** The rules' example: one guess, three marks. */
export function WordExample() {
  const examples: [string, number, WordMark, string][] = [
    ['TREND', 0, 'hit', 'is in the word, in that spot.'],
    ['CHART', 2, 'near', 'is in the word, in another spot.'],
    ['SLOPE', 3, 'miss', 'isn’t in the word.'],
  ];
  return (
    <>
      {examples.map(([word, at, mark, says]) => (
        <div key={word} className="dg-eg">
          <div className="dw-eg" aria-hidden="true">
            {[...word].map((l, i) => (
              <span key={i} className={cx('dw-tile', 'is-filled', i === at && `is-${mark}`)}>
                {l}
              </span>
            ))}
          </div>
          <p className="dg-eg__caption">
            <strong>{word[at]}</strong> {says}
          </p>
        </div>
      ))}
    </>
  );
}
