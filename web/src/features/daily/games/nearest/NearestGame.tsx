// Nearest Neighbour, as DSBA Daily lays it out: the guess count, the box with its button, the latest guess pinned
// under it, then every guess closest first, each a row whose bar fills with how close it is (green close, yellow
// warm, red far); Hint and Give up at the foot. 1 is the secret word.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, cx, glyph, Icon } from '../../../../ui';
import { BAND_LABEL, band, byCloseness, closeness } from '../../lib/nearest';
import type { NearestGuess } from '../../types';
import type { GameProps } from '../registry';
import './NearestGame.css';

export function NearestGame({ out, busy, play, flash, askGiveUp }: GameProps) {
  const { play: state } = out;
  const view = state.view.kind === 'nearest' ? state.view : null;
  const guesses = view?.guesses ?? [];
  const vocabulary = view?.vocabulary ?? 500;
  const over = state.status === 'won' || state.status === 'lost';
  const latest = guesses[guesses.length - 1];
  const sorted = byCloseness(guesses);
  const best = sorted[0]?.rank ?? null;

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
      flash(`Already guessed “${guess}”`, 'info');
      after(tried);
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
    input.current?.focus();
    if (r.out.play.view.kind !== 'nearest') return;
    const g = r.out.play.view.guesses[r.out.play.view.guesses.length - 1];
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
  const hints = guesses.length - plain;
  return (
    <div className="dn">
      <p className="dn-count">
        #{state.number} · Guesses: <b className="dy-num">{plain}</b>
        {hints > 0 ? (
          <>
            {' '}
            · Hints: <b className="dy-num">{hints}</b>
          </>
        ) : null}
      </p>

      {!over ? (
        <form className="dn-form" onSubmit={(e) => void submit(e)}>
          <label className="visually-hidden" htmlFor="dn-guess">
            Type a word
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
          <Button
            type="submit"
            variant="primary"
            className="dn-go"
            aria-label="Guess"
            disabled={!word.trim()}
            loading={busy && !!word}
          >
            <Icon glyph={glyph.forward} />
          </Button>
        </form>
      ) : view?.answer ? (
        <div className="dn-answer">
          <span className="dn-answer__label">{state.status === 'won' ? 'You found it!' : 'The word was…'}</span>
          <strong className="dn-answer__word">{view.answer}</strong>
        </div>
      ) : null}

      {latest && !over && latest.rank !== 1 ? (
        <div className="dn-latest" key={latest.word}>
          <p className="dn-latest__label">Latest</p>
          <Row guess={latest} vocabulary={vocabulary} />
        </div>
      ) : null}

      {guesses.length ? (
        <ol className="dn-list" aria-label="Your guesses, closest first">
          {sorted.map((g) => (
            <li key={g.word}>
              <Row guess={g} vocabulary={vocabulary} fresh={fresh === g.word} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="dn-empty">
          <p className="dn-empty__title">Guess any word to begin</p>
          <p className="dn-empty__body">Each guess shows how close it is in meaning. #1 is the secret word.</p>
        </div>
      )}

      {!over ? (
        <div className="dn-foot">
          <Button
            variant="secondary"
            className="dn-foot__hint"
            leadingIcon={<Icon glyph={glyph.bulb} />}
            onClick={() => void hint()}
            disabled={busy || best === 1 || (best !== null && best <= 2)}
          >
            Hint
          </Button>
          <Button
            variant="ghost"
            leadingIcon={<Icon glyph={glyph.flag} />}
            onClick={askGiveUp}
            disabled={busy || !guesses.length}
          >
            Give up
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** One guess: its word and rank over a bar that fills with how close it is, as DSBA Daily draws it. */
function Row({ guess, vocabulary, fresh = false }: { guess: NearestGuess; vocabulary: number; fresh?: boolean }) {
  const b = band(guess.rank);
  const fill = Math.max(0.03, closeness(guess.rank, vocabulary));
  return (
    <div className={cx('dn-row', `is-${b}`, fresh && 'is-fresh')} style={{ '--fill': fill } as CSSProperties}>
      <span className="dn-row__bar" aria-hidden="true" />
      <span className="dn-row__word">
        {guess.word}
        {guess.hint ? (
          <>
            <Icon glyph={glyph.bulb} className="dn-row__hint" />
            <span className="visually-hidden">, from a hint</span>
          </>
        ) : null}
      </span>
      <span className="dn-row__rank dy-num">
        <span className="visually-hidden">{BAND_LABEL[b]}, rank </span>
        {b === 'found' ? (
          <>
            <Icon glyph={glyph.sparkle} />
            <span className="visually-hidden">1</span>
          </>
        ) : (
          guess.rank.toLocaleString('en')
        )}
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
          <Row key={g.word} guess={g} vocabulary={483} />
        ))}
      </div>
      <p className="dg-eg__caption">
        If the secret word were <strong>revenue</strong>, profit would be #2: the closest word to it. Money is close;
        weather is far away.
      </p>
    </div>
  );
}
