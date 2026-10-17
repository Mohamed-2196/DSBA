// Correlations: sixteen words, four groups of four. Pick four and submit: a group found becomes a coloured bar (its
// level's colour, plainest to trickiest), a near miss says "one away", and four mistakes end the play. Picks stay
// after a miss so one word can be swapped; the player's own arrangement of the board is kept.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { Button, cx } from '../../../../ui';
import { MAX_MISTAKES, breakable, keepOrder, shuffled } from '../../lib/groups';
import type { FoundGroup } from '../../types';
import type { GameProps } from '../registry';
import './GroupsGame.css';

const LEVEL_NAME = ['', 'plainest', 'plain', 'tricky', 'trickiest'] as const;

export function GroupsGame({ out, busy, play, flash }: GameProps) {
  const { play: state } = out;
  const view = state.view.kind === 'groups' ? state.view : null;
  const over = state.status === 'won' || state.status === 'lost';
  const words = view?.words ?? [];
  const found = view?.found ?? [];
  const mistakesLeft = view?.mistakesLeft ?? MAX_MISTAKES;

  const [order, setOrder] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // the label of the group just found
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const board = keepOrder(order, words);
  const pickedNow = picked.filter((w) => words.includes(w));

  const toggle = (word: string) => {
    if (over || busy || sending) return;
    setPicked((p) => (p.includes(word) ? p.filter((w) => w !== word) : p.length < 4 ? [...p, word] : p));
  };

  const submit = async () => {
    if (pickedNow.length !== 4 || busy || sending || over) return;
    if (view?.guesses.some((g) => [...g].sort().join('|') === [...pickedNow].map((w) => w.toUpperCase()).sort().join('|'))) {
      flash('You’ve tried those four already', 'alert');
      return;
    }
    setSending(true);
    const r = await play({ kind: 'group', words: pickedNow });
    later(() => setSending(false), 300);
    if (!r.ok) {
      flash(r.message, 'alert');
      return;
    }
    const after = r.out.play;
    if (after.result === 'found') {
      const latest = after.view.kind === 'groups' ? after.view.found.find((g) => g.words.every((w) => pickedNow.includes(w))) : undefined;
      setPicked([]);
      if (latest) {
        setFresh(latest.label);
        later(() => setFresh(null), 900);
      }
      if (after.status === 'won') later(() => flash(after.mistakes === 0 ? 'Perfect' : 'Solved', 'good'), 500);
      return;
    }
    setWrong(true);
    later(() => setWrong(false), 450);
    if (after.status === 'lost') flash('Out of mistakes', 'alert');
    else flash(after.result === 'one-away' ? 'One away…' : 'Not a group', after.result === 'one-away' ? 'info' : 'alert');
  };

  const rowsLeft = Math.ceil(board.length / 4);
  return (
    <div className="dgr">
      <p className="dgr-lede">{over ? (state.status === 'won' ? 'All four groups found' : 'The groups') : 'Make four groups of four'}</p>

      <div className="dgr-board-wrap">
        <div className="dgr-board" style={{ '--rows': found.length + rowsLeft } as CSSProperties}>
          {found.map((g) => (
            <GroupBar key={g.label} group={g} fresh={g.label === fresh} />
          ))}
          {board.map((word) => {
            const on = pickedNow.includes(word);
            return (
              <button
                key={word}
                type="button"
                className={cx('dgr-word', on && 'is-picked', on && sending && 'is-sending', on && wrong && 'is-wrong')}
                style={{ '--n': pickedNow.indexOf(word), '--chars': Math.max(word.length, 4) } as CSSProperties}
                aria-pressed={on}
                aria-label={word}
                disabled={over}
                onClick={() => toggle(word)}
              >
                {breakable(word)}
              </button>
            );
          })}
        </div>
      </div>

      {!over ? (
        <>
          <div className="dgr-mistakes" aria-label={`${mistakesLeft} ${mistakesLeft === 1 ? 'mistake' : 'mistakes'} left`}>
            <span aria-hidden="true">Mistakes left</span>
            <span className="dgr-mistakes__dots" aria-hidden="true">
              {Array.from({ length: MAX_MISTAKES }, (_, i) => (
                <span key={i} className={cx('dgr-dot', i >= mistakesLeft && 'is-used')} />
              ))}
            </span>
          </div>
          <div className="dgr-actions">
            <Button variant="secondary" leadingIcon={ArrowsClockwise} onClick={() => setOrder(shuffled(board))} disabled={busy}>
              Shuffle
            </Button>
            <Button variant="secondary" onClick={() => setPicked([])} disabled={pickedNow.length === 0 || busy}>
              Deselect all
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={pickedNow.length !== 4} loading={busy}>
              Submit
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function GroupBar({ group, fresh }: { group: FoundGroup; fresh: boolean }) {
  return (
    <div className={cx('dgr-group', `dgr-group--${group.level}`, fresh && 'is-fresh')} role="group" aria-label={`${group.label}, ${LEVEL_NAME[group.level] ?? ''} group: ${group.words.join(', ')}`}>
      <span className="dgr-group__label">{group.label}</span>
      <span className="dgr-group__words">{group.words.join(', ')}</span>
    </div>
  );
}

/** The rules' example: a group found, and the four levels' colours. */
export function GroupsExample() {
  return (
    <>
      <div className="dg-eg">
        <div className="dgr-eg">
          <GroupBar group={{ label: 'Measures of centre', level: 1, words: ['MEAN', 'MEDIAN', 'MODE', 'MIDRANGE'] }} fresh={false} />
        </div>
        <p className="dg-eg__caption">
          Four words that share something make a group. Each group has a colour for how tricky it is:
        </p>
      </div>
      <div className="dgr-eg-levels" aria-hidden="true">
        {[1, 2, 3, 4].map((level) => (
          <span key={level} className={`dgr-eg-level dgr-group--${level}`}>
            {LEVEL_NAME[level]}
          </span>
        ))}
      </div>
    </>
  );
}
