// The Daily Query: five questions, one at a time. An answer shows straight away whether it was right, with a short
// explanation, before the next question. Once it's over, every question can be gone back over.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from '@phosphor-icons/react';
import { Button, cx } from '../../../../ui';
import type { QuizAnswered } from '../../types';
import type { GameProps } from '../registry';
import './QuizGame.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const typingInto = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function QuizGame({ out, busy, play, flash, paused, showResult }: GameProps) {
  const { play: state } = out;
  const view = state.view.kind === 'quiz' ? state.view : null;
  const questions = view?.questions ?? [];
  const answered = view?.answered ?? [];
  const over = state.status === 'won' || state.status === 'lost';
  const total = questions.length;

  // The question shown: the first not yet answered; from the start once it's over, to go back over them.
  const [index, setIndex] = useState(() => (over ? 0 : Math.min(answered.length, Math.max(total - 1, 0))));
  const [just, setJust] = useState<number | null>(null); // the question answered a moment ago
  const nextRef = useRef<HTMLElement>(null);
  const question = questions[index];
  const answer: QuizAnswered | undefined = answered[index];
  const last = index === total - 1;

  useEffect(() => {
    if (just !== null) nextRef.current?.focus({ preventScroll: true });
  }, [just]);

  const choose = async (choice: number) => {
    if (busy || answer || over || index !== answered.length) return;
    const r = await play({ kind: 'answer', choice });
    if (!r.ok) {
      flash(r.message, 'alert');
      return;
    }
    setJust(index);
  };

  const next = () => {
    if (last) {
      if (over) showResult();
      return;
    }
    setJust(null);
    setIndex((i) => Math.min(i + 1, total - 1));
  };

  // Keys: 1-4 or A-D answer, Enter goes on.
  const handler = useRef<(e: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    handler.current = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typingInto(e.target)) return;
      if (e.key === 'Enter' && answer && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        next();
        return;
      }
      const n = /^[1-6]$/.test(e.key) ? Number(e.key) - 1 : LETTERS.indexOf(e.key.toUpperCase());
      if (question && n >= 0 && n < question.options.length && !answer) {
        e.preventDefault();
        void choose(n);
      }
    };
  });
  useEffect(() => {
    if (paused) return undefined;
    const onKey = (e: KeyboardEvent) => handler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused]);

  if (!question) return null;
  return (
    <div className="dq">
      <ol className="dq-steps" aria-label={`Question ${index + 1} of ${total}`}>
        {questions.map((_, i) => {
          const a = answered[i];
          return (
            <li
              key={i}
              className={cx('dq-step', a && (a.correct ? 'is-right' : 'is-wrong'), i === index && 'is-current')}
            >
              <button
                type="button"
                className="dq-step__hit"
                disabled={!over}
                onClick={() => setIndex(i)}
                aria-label={`Question ${i + 1}${a ? (a.correct ? ', right' : ', wrong') : ''}`}
                aria-current={i === index ? 'step' : undefined}
              />
            </li>
          );
        })}
      </ol>

      <div className="dq-card" key={index}>
        <p className="dq-meta">
          <span className="dy-num">
            Question {index + 1} of {total}
          </span>
          {question.source ? <span className="dq-source">{question.source}</span> : null}
        </p>
        <h2 className="dq-prompt">{question.prompt}</h2>

        <div className="dq-options" role="group" aria-label="Answers">
          {question.options.map((option, i) => {
            const chosen = answer?.choice === i;
            const right = answer ? answer.answer === i : false;
            const state = right ? 'is-right' : chosen && !answer?.correct ? 'is-wrong' : answer ? 'is-other' : '';
            return (
              <button
                key={option}
                type="button"
                className={cx('dq-option', state, chosen && 'is-chosen')}
                onClick={() => void choose(i)}
                disabled={Boolean(answer) || over || busy}
                aria-pressed={chosen}
              >
                <span className="dq-option__key" aria-hidden="true">
                  {right ? <Check weight="bold" /> : chosen && !answer?.correct ? <X weight="bold" /> : LETTERS[i]}
                </span>
                <span className="dq-option__text">{option}</span>
                {answer ? (
                  <span className="visually-hidden">
                    {right ? ' (right answer)' : chosen ? ' (your answer, wrong)' : ''}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {answer ? (
          <div
            className={cx('dq-explain', answer.correct ? 'is-right' : 'is-wrong', just === index && 'dy-rise')}
            role="status"
          >
            <p className="dq-explain__head">{answer.correct ? 'Right' : 'Not quite'}</p>
            <p className="dq-explain__body">{answer.explain}</p>
          </div>
        ) : null}
      </div>

      <div className="dq-nav">
        {over && index > 0 ? (
          <Button variant="ghost" leadingIcon={ArrowLeft} onClick={() => setIndex((i) => i - 1)}>
            Previous
          </Button>
        ) : (
          <span />
        )}
        {answer ? (
          last ? (
            over ? (
              <Button ref={nextRef} variant="primary" onClick={showResult}>
                See your result
              </Button>
            ) : null
          ) : (
            <Button ref={nextRef} variant={over ? 'secondary' : 'primary'} trailingIcon={ArrowRight} onClick={next}>
              {over ? 'Next' : 'Next question'}
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

/** The rules' example: an answered question. */
export function QuizExample() {
  return (
    <div className="dg-eg">
      <div className="dq-options dq-eg" aria-hidden="true">
        <span className="dq-option is-other">
          <span className="dq-option__key">A</span>
          <span className="dq-option__text">Median</span>
        </span>
        <span className="dq-option is-right is-chosen">
          <span className="dq-option__key">
            <Check weight="bold" />
          </span>
          <span className="dq-option__text">Mean</span>
        </span>
      </div>
      <p className="dg-eg__caption">Pick an answer: you’ll see at once if it’s right, and why.</p>
    </div>
  );
}
