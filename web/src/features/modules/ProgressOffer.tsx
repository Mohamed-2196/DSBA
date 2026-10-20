// Lesson progress is off until the person turns it on. The lesson page asks once, quietly, under the lesson's
// title; either answer puts it away for good in this browser. Account settings (and the chapter list's menu) keep
// the switch afterwards.
import { useLocalStorage } from '../../state';
import { Button, Icon, glyph } from '../../ui';
import { OFFER_KEY } from './tracking';

export function ProgressOffer({ onTurnOn }: { onTurnOn: () => void }) {
  const [answered, setAnswered] = useLocalStorage<boolean>(OFFER_KEY, false);
  if (answered === true) return null;
  return (
    <div className="mod-offer" role="region" aria-label="Lesson progress" data-hub="progress-offer">
      <Icon glyph={glyph.success} className="mod-offer__icon" />
      <p className="mod-offer__text">
        Keep track of what you’ve watched? You can mark lessons as watched and pick up where you left off.
      </p>
      <div className="mod-offer__actions">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setAnswered(true);
            onTurnOn();
          }}
        >
          Turn on
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAnswered(true)}>
          No thanks
        </Button>
      </div>
    </div>
  );
}
