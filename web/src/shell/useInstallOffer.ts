// "Install the app" for the account menu and the More drawer: the browser's own prompt where it offers one, the steps
// for an iPhone or Android where it doesn't (InstallSteps.tsx), nothing once the app is installed or where it can't
// be (lib/pwa.ts, installWay).
import { useState } from 'react';
import { installWay, useInstall, type InstallWay } from '../lib/pwa';

export interface InstallOffer {
  /** null: nothing to offer on this device */
  way: InstallWay | null;
  /** shows the browser's prompt, or opens the steps */
  start: () => void;
  stepsOpen: boolean;
  closeSteps: () => void;
}

export function useInstallOffer(): InstallOffer {
  const { canPrompt, installed, prompt } = useInstall();
  const [stepsOpen, setStepsOpen] = useState(false);
  const way =
    typeof navigator === 'undefined'
      ? null
      : installWay({ canPrompt, installed, userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints });
  return {
    way,
    start: () => {
      if (way === 'prompt') void prompt();
      else setStepsOpen(true);
    },
    stepsOpen,
    closeSteps: () => setStepsOpen(false),
  };
}
