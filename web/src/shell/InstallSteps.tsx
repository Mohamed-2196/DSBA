// The steps to install the app where the browser has no prompt of its own (an iPhone or iPad, some Android browsers,
// Safari on a Mac).
import { Button, Modal } from '../ui';
import type { InstallOffer } from './useInstallOffer';
import './InstallSteps.css';

const STEPS = {
  iphone: ['Open the Hub in Safari.', 'Tap Share at the bottom of the screen.', 'Tap Add to Home Screen, then Add.'],
  android: ['Open the browser’s menu (the three dots).', 'Tap Install app, or Add to Home screen.'],
  mac: ['In Safari’s menu bar, choose File, then Add to Dock.', 'Click Add.'],
};

const DESCRIPTION = {
  iphone: 'The Hub then opens from your home screen like any other app.',
  android: 'The Hub then opens from your home screen like any other app.',
  mac: 'The Hub then opens from your Dock in its own window. This needs macOS Sonoma 14 or later.',
};

export function InstallSteps({ offer }: { offer: InstallOffer }) {
  if (offer.way !== 'iphone' && offer.way !== 'android' && offer.way !== 'mac') return null;
  return (
    <Modal
      open={offer.stepsOpen}
      onClose={offer.closeSteps}
      size="sm"
      title="Install the app"
      description={DESCRIPTION[offer.way]}
      footer={
        <Button variant="primary" onClick={offer.closeSteps} data-autofocus>
          Done
        </Button>
      }
    >
      <ol className="shell-install__steps">
        {STEPS[offer.way].map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </Modal>
  );
}
