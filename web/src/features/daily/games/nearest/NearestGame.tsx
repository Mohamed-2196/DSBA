// Nearest Neighbour: find the secret word by meaning. Every guess comes back with its rank (1 is the secret word),
// listed closest first with a bar for how close it is; the latest guess stays at the top so the change is easy to
// read. A hint shows a word closer than the best so far.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Lightbulb } from '@phosphor-icons/react';
import { Button, cx } from '../../../../ui';
import { BAND_LABEL, band, bestRank, byCloseness, closeness } from '../../lib/nearest';
import { HELD } from '../../lib/result';
import type { NearestGuess } from '../../types';
import type { GameProps } from '../registry';
import './NearestGame.css';

export function NearestGame({ out, busy, play, flash }: GameProps) {
  const { play: state } = out;
  const view = state.view.kind === 'nearest' ? state.view : null;
  const guesses = view?.guesses ?? [];
  const vocabulary = view?.vocabulary ?? 500;
  const over = state.status === 'won' || state.status === 'lost';
  const best = bestRank(guesses);
  const latest = guesses[guesses.length - 1];
  const sorted = byCloseness(guesses);

  const [word, setWord] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const after = (g: NearestGuess | undefined) => {
    if (!g) return;
    setFresh(g.word);
    timers.current.push(window.setTimeout(() => setFresh(null), 1200));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const guess = word.trim().toLowerCase();
    if (!guess || busy || over) return;
    const tried = guesses.find((g) => g.word === guess);
    if (tried) {
      flash(`You’ve tried “${guess}”: #${tried.rank}`, 'info');
      setWord('');
      return;
    }
    const r = await play({ kind: 'guess', word: guess });
    if (!r.ok) {
      flash(r.message, 'alert');
      input.current?.select();
      return;
    }
    setWord('');
    if (r.out.play.view.kind !== 'nearest') return;
    const g = r.out.play.view.guesses[r.out.play.view.guesses.length - 1];
    after(g);
    if (g?.rank === 1) flash('Found it', 'good');
    else if (g && g.rank <= 10) flash('Very close', 'info');
  };

  const hint = async () => {
    const r = await play({ kind: 'hint' });
    if (!r.ok) {
      flash(r.message, 'alert');
      return;
    }
    if (r.out.play.view.kind === 'nearest') after(r.out.play.view.guesses[r.out.play.view.guesses.length - 1]);
  };

  const plain = guesses.filter((g) => !g.hint).length;
  return (
    <div className="dn">
      {!over ? (
        <form className="dn-form" onSubmit={(e) => void submit(e)}>
          <label className="visually-hidden" htmlFor="dn-guess">
            Your guess
          </label>
          <input
            ref={input}
            id="dn-guess"
            className="dn-input"
            value={word}
            onChange={(e) => setWord(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 24))}
            placeholder="Type a word"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            disabled={busy}
          />
          <Button type="submit" variant="primary" disabled={!word.trim()} loading={busy}>
            Guess
          </Button>
          <Button
            variant="secondary"
            leadingIcon={Lightbulb}
            onClick={() => void hint()}
            disabled={busy || best === 1 || (best !== null && best <= 2)}
          >
            Hint
          </Button>
        </form>
      ) : (
        <div className={cx('dn-answer', state.status === 'won' && 'is-won')}>
          {view?.answer ? (
            <>
              <span className="dn-answer__label">The secret word</span>
              <strong className="dn-answer__word">{view.answer}</strong>
            </>
          ) : (
            <span className="dn-answer__label">{HELD}</span>
          )}
        </div>
      )}

      {best !== null ? (
        <div className="dn-best" aria-live="polite">
          <div className="dn-best__head">
            <span>
              Closest so far: <strong className="dy-num">#{best}</strong>
            </span>
            <span>
              {plain} {plain === 1 ? 'guess' : 'guesses'}
              {state.hints ? `, ${state.hints} ${state.hints === 1 ? 'hint' : 'hints'}` : ''}
            </span>
          </div>
          <Meter rank={best} vocabulary={vocabulary} />
        </div>
      ) : null}

      {latest && guesses.length > 1 && !over && sorted[0] !== latest ? (
        <div className="dn-latest">
          <span className="dn-latest__label">Last guess</span>
          <Row guess={latest} vocabulary={vocabulary} fresh={fresh === latest.word} />
        </div>
      ) : null}

      {guesses.length ? (
        <ol className="dn-list" aria-label="Your guesses, closest first">
          {sorted.map((g) => (
            <li key={g.word}>
              <Row guess={g} vocabulary={vocabulary} fresh={fresh === g.word && guesses.length === 1} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="dn-empty">
          <p className="dn-empty__title">Guess any word to begin</p>
          <p className="dn-empty__body">
            Each guess shows how close it is in meaning. #1 is the secret word, and the lower the number, the closer you
            are.
          </p>
        </div>
      )}
    </div>
  );
}

function Meter({ rank, vocabulary }: { rank: number; vocabulary: number }) {
  const b = band(rank);
  return (
    <span
      className={cx('dn-meter', `is-${b}`)}
      style={{ '--fill': `${Math.max(4, Math.round(closeness(rank, vocabulary) * 100))}%` } as CSSProperties}
      aria-hidden="true"
    >
      <span className="dn-meter__fill" />
    </span>
  );
}

function Row({ guess, vocabulary, fresh }: { guess: NearestGuess; vocabulary: number; fresh: boolean }) {
  const b = band(guess.rank);
  return (
    <div className={cx('dn-row', `is-${b}`, fresh && 'is-fresh')}>
      <span className="dn-row__word">
        {guess.word}
        {guess.hint ? <span className="dn-row__hint">Hint</span> : null}
      </span>
      <Meter rank={guess.rank} vocabulary={vocabulary} />
      <span className="dn-row__rank dy-num">
        <span className="visually-hidden">{BAND_LABEL[b]}, rank </span>#{guess.rank}
      </span>
    </div>
  );
}

/** The rules' example: three guesses, closest first. */
export function NearestExample() {
  const examples: NearestGuess[] = [
    { word: 'profit', rank: 2, hint: false },
    { word: 'money', rank: 30, hint: false },
    { word: 'weather', rank: 475, hint: false },
  ];
  return (
    <div className="dg-eg">
      <div className="dn-eg" aria-hidden="true">
        {examples.map((g) => (
          <Row key={g.word} guess={g} vocabulary={483} fresh={false} />
        ))}
      </div>
      <p className="dg-eg__caption">
        If the secret word were <strong>revenue</strong>, profit would be #2: the closest word to it. Money is close;
        weather is far away.
      </p>
    </div>
  );
}
