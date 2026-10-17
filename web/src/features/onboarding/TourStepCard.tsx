// One step of the tour as its dialog shows it, without the buttons: for Site settings' preview.
import type { TourStep } from '../../api/types';
import { tourArtOf } from './tourArts';
import { TourText } from './TourText';
import './Onboarding.css';

export function TourStepCard({ step, n, of }: { step: TourStep; n: number; of: number }) {
  const Art = tourArtOf(step.art);
  return (
    <div className="onb-tour onb-tour--card">
      <div className="onb-tour__art">
        <Art />
      </div>
      <div className="onb-tour__text">
        <p className="onb-tour__kicker">
          <span className="onb-tour__year">{`Step ${n} of ${of}`}</span>
        </p>
        <h3 className="onb-tour__title">{step.title}</h3>
        <p className="onb-tour__body">
          <TourText text={step.body} />
        </p>
      </div>
    </div>
  );
}
