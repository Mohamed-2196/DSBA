import { useState } from 'react';
import { ArrowRight, Check, X } from '@phosphor-icons/react';
import type { PlayOut, QuizView } from '../../types';
import { useDailyMove } from '../../api';
import './QuizGameView.css';

interface QuizGameViewProps {
  playOut: PlayOut;
  day: string;
}

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

export function QuizGameView({ playOut, day }: QuizGameViewProps) {
  const { play } = playOut;
  const view = play.view as unknown as QuizView;
  const isOver = play.status === 'won' || play.status === 'lost';

  const questions = view.questions ?? [];
  const answered = view.answered ?? [];

  // Active question index to display (user can also step through past answered questions)
  const currentQuestionIndex = Math.min(answered.length, Math.max(0, questions.length - 1));
  const [activeIdx, setActiveIdx] = useState(currentQuestionIndex);

  // If new answers come in and we were at the end, advance
  const displayedIdx = Math.min(activeIdx, questions.length - 1);
  const currentQ = questions[displayedIdx];
  const answerInfo = answered[displayedIdx];

  const moveMutation = useDailyMove(day, 'quiz');

  const handleSelectOption = (choiceIndex: number) => {
    if (isOver || answerInfo !== undefined || moveMutation.isPending) return;
    moveMutation.mutate(
      { kind: 'answer', choice: choiceIndex },
      {
        onSuccess: () => {
          // Stay on current question to let them read the explanation!
          // They can click "Next Question" to proceed.
        },
      },
    );
  };

  const handleNext = () => {
    if (displayedIdx < questions.length - 1) {
      setActiveIdx(displayedIdx + 1);
    }
  };

  if (!currentQ) return null;

  return (
    <div className="quiz-container" role="region" aria-label="The Daily Query Quiz">
      {/* 5-step Progress Bar */}
      <div className="quiz-progress-bar" role="progressbar" aria-valuenow={answered.length} aria-valuemax={5}>
        {Array.from({ length: 5 }).map((_, i) => {
          const ans = answered[i];
          let stepClass = 'quiz-progress-step';
          if (ans !== undefined) {
            stepClass += ans.correct ? ' step-correct' : ' step-wrong';
          } else if (i === displayedIdx) {
            stepClass += ' step-current';
          }
          return <span key={i} className={stepClass} />;
        })}
      </div>

      {/* Main Question Card */}
      <div className="quiz-card">
        <div className="quiz-card-header">
          <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)', fontWeight: 'var(--fw-medium)' }}>
            Question {displayedIdx + 1} of {questions.length}
          </span>
          {currentQ.source && <span className="quiz-source-tag">{currentQ.source}</span>}
        </div>

        <h3 className="quiz-prompt">{currentQ.prompt}</h3>

        {/* 4 Options */}
        <div className="quiz-options" role="radiogroup">
          {currentQ.options.map((optionText, optIdx) => {
            const hasAnswered = answerInfo !== undefined;
            const isUserChoice = hasAnswered && answerInfo.choice === optIdx;
            const isCorrectAnswer = hasAnswered && answerInfo.answer === optIdx;

            let optClass = 'quiz-option-btn';
            if (hasAnswered) {
              if (isCorrectAnswer) optClass += ' option-correct';
              else if (isUserChoice && !answerInfo.correct) optClass += ' option-wrong';
            }

            return (
              <button
                key={optIdx}
                type="button"
                className={optClass}
                onClick={() => handleSelectOption(optIdx)}
                disabled={hasAnswered || moveMutation.isPending}
                role="radio"
                aria-checked={isUserChoice}
              >
                <span className="quiz-option-key">
                  {hasAnswered && isCorrectAnswer ? (
                    <Check size={16} />
                  ) : hasAnswered && isUserChoice && !answerInfo.correct ? (
                    <X size={16} />
                  ) : (
                    OPTION_KEYS[optIdx]
                  )}
                </span>
                <span style={{ flex: 1 }}>{optionText}</span>
              </button>
            );
          })}
        </div>

        {/* Explanation Card when answered */}
        {answerInfo && (
          <div className="quiz-explain-card" role="note">
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              {answerInfo.correct ? '✓ Correct!' : '✗ Not quite.'}
            </strong>
            <span>{answerInfo.explain}</span>
          </div>
        )}

        {/* Next Question Navigation */}
        {answerInfo && displayedIdx < questions.length - 1 && (
          <div className="quiz-nav-row">
            <button
              type="button"
              className="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                borderRadius: 'var(--r-pill)',
                border: 'none',
                backgroundColor: 'var(--navy)',
                color: 'var(--cobalt-ink)',
                fontWeight: 'var(--fw-semibold)',
                cursor: 'pointer',
              }}
              onClick={handleNext}
            >
              <span>Next question</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
