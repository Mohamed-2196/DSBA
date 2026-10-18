// The optional tour of what's new, in a dialog. It opens only when asked for ("Take the tour" in the year prompt):
// nothing about it blocks a page (decision D7). Its steps are Site settings' tour, which admins edit.
import { useEffect, useRef, useState } from 'react';
import { COHORTS, type CohortYear } from '../../state';
import { Button, Modal, cx } from '../../ui';
import { useSite } from '../site/public';
import { tourArtOf } from './tourArts';
import { TourText } from './TourText';

export interface TourProps {
  open: boolean;
  /** the year just chosen, for the line above each step */
  year: CohortYear | null;
  onClose: () => void;
}

export function Tour({ open, year, onClose }: TourProps) {
  const TOUR = useSite().data?.tour ?? [];
  const [step, setStep] = useState(1);
  const nextRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);
  // Each step hands focus to its primary button (the one that was pressed may be gone).
  useEffect(() => {
    if (open) requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }));
  }, [open, step]);
  const tour = TOUR[step - 1] ?? TOUR[0];
  if (!tour) return null;
  const Art = tourArtOf(tour.art);
  const last = step >= TOUR.length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`What’s new: ${tour.title}`}
      hideHeader
      size="xl"
      className="onb onb--tour"
      bodyClassName="onb-body"
      data-hub="onboarding-tour"
    >
      <div className="onb-step onb-step--tour" key={tour.id}>
        <div className="onb-tour">
          <div className="onb-tour__art">
            <Art />
          </div>
          <div className="onb-tour__text">
            <p className="onb-tour__kicker">
              <span className={cx('onb-tour__year', year && `onb-tour__year--y${year}`)}>
                {year ? `${COHORTS[year].label} is set` : 'What’s new'}
              </span>
              <span className="onb-tour__progress u-tabular" aria-label={`Step ${step} of ${TOUR.length}`}>
                {TOUR.map((t, i) => (
                  <span key={t.id} className={cx('onb-dot', i + 1 === step && 'is-on', i + 1 < step && 'is-done')} />
                ))}
              </span>
            </p>
            <h2 className="onb-tour__title">{tour.title}</h2>
            <p className="onb-tour__body">
              <TourText text={tour.body} />
            </p>
            <div className="onb-tour__actions">
              {last ? (
                <span />
              ) : (
                <Button variant="ghost" onClick={onClose}>
                  End the tour
                </Button>
              )}
              <span className="onb-tour__nav">
                {step > 1 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : null}
                <Button ref={nextRef} variant="primary" onClick={last ? onClose : () => setStep(step + 1)}>
                  {last ? 'Done' : 'Next'}
                </Button>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
