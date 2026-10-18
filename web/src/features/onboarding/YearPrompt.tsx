// The year prompt: a small card over the corner of the page, never a wall (decision D7, UX review UX-7). A first
// visit on any link shows the page with this card: pick a year, say you're not a student, or sign in. Once a year
// is picked it offers the tour.
import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { CheckCircle, X } from '@phosphor-icons/react';
import { COHORTS, YEARS, cohortColor, type CohortYear } from '../../state';
import { Button, HubLogo, IconButton, cx } from '../../ui';

export type PromptStage = 'year' | 'set';

export interface YearPromptProps {
  stage: PromptStage;
  /** the year just picked (stage 'set') */
  year: CohortYear | null;
  /** a signed-in student without a cohort: the year is saved on their account, and there is no "Sign in" */
  signedIn: boolean;
  /** saving the year on the account */
  busy: boolean;
  onChoose: (year: CohortYear) => void;
  onNotStudent: () => void;
  onSignIn: () => void;
  /** "Not now": the prompt comes back on the next visit */
  onLater: () => void;
  onTour: () => void;
  onDone: () => void;
}

export function YearPrompt({
  stage,
  year,
  signedIn,
  busy,
  onChoose,
  onNotStudent,
  onSignIn,
  onLater,
  onTour,
  onDone,
}: YearPromptProps) {
  const titleId = useId();
  const tourRef = useRef<HTMLElement>(null);
  // The year buttons go when one is picked: the keyboard moves on to the tour question.
  useEffect(() => {
    if (stage === 'set') tourRef.current?.focus({ preventScroll: true });
  }, [stage]);

  return (
    <aside className={cx('onb-prompt', `onb-prompt--${stage}`)} aria-labelledby={titleId} data-hub="onboarding-prompt">
      {stage === 'year' ? (
        <>
          <div className="onb-prompt__head">
            <HubLogo variant="tile" size={36} optional decorative className="onb-prompt__mark" />
            <div className="onb-prompt__text">
              <h2 id={titleId} className="onb-prompt__title">
                Which year are you in?
              </h2>
              <p className="onb-prompt__desc">
                We’ll put your modules and exams first. You can change it any time from the year switcher.
              </p>
            </div>
            <IconButton
              label="Not now"
              icon={X}
              size="sm"
              tooltip
              tooltipSide="top"
              onClick={onLater}
              className="onb-prompt__close"
            />
          </div>
          <div className="onb-prompt__years" role="group" aria-label="Your year">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                className="onb-year"
                style={{ '--onb-year': cohortColor(y) } as CSSProperties}
                onClick={() => onChoose(y)}
                disabled={busy}
                data-hub={`onboarding-y${y}`}
              >
                <span className="onb-year__dot" aria-hidden="true" />
                {COHORTS[y].label}
              </button>
            ))}
          </div>
          <div className="onb-prompt__other">
            <button type="button" className="onb-prompt__link" onClick={onNotStudent} data-hub="onboarding-not-student">
              I’m not a student
            </button>
            {signedIn ? null : (
              <button type="button" className="onb-prompt__link" onClick={onSignIn}>
                Sign in
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="onb-prompt__head">
            <CheckCircle className="onb-prompt__done" weight="fill" aria-hidden="true" />
            <div className="onb-prompt__text">
              <h2 id={titleId} className="onb-prompt__title">
                {year ? `${COHORTS[year].label} is set` : 'Your year is set'}
              </h2>
              <p className="onb-prompt__desc">Want a quick look at what’s new? It’s three short steps.</p>
            </div>
          </div>
          <div className="onb-prompt__actions">
            <Button variant="ghost" size="sm" onClick={onDone}>
              Skip the tour
            </Button>
            <Button ref={tourRef} variant="primary" size="sm" onClick={onTour}>
              Take the tour
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
