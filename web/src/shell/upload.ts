// "Upload a file" from anywhere (decision D6: Contribute means upload): the top bar, More, the footer, the command
// palette and About call openUpload(), and the shell's UploadHost opens the upload dialog over the page on screen
// (with its module chosen, on a module's page). Guests sign in first. A link with ?upload=1 does the same on any
// page. It shows only while uploading can work (showsUpload).
import { useSyncExternalStore } from 'react';
import { showsUpload, useAuth } from '../auth';

/** A link that opens the upload dialog (a new tab, or a link in the newsletter). */
export const UPLOAD_PATH = '/modules?upload=1';

const ASKED = 'hub:upload-asked';
let asked = 0;

/** Open the upload dialog over the page on screen (guests sign in first). */
export function openUpload(): void {
  asked += 1;
  window.dispatchEvent(new Event(ASKED));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(ASKED, cb);
  return () => window.removeEventListener(ASKED, cb);
};

/** How many times the upload dialog was asked for: UploadHost opens it each time this goes up. */
export function useUploadAsked(): number {
  return useSyncExternalStore(
    subscribe,
    () => asked,
    () => 0,
  );
}

/** "Upload a file" belongs in the shell right now. */
export function useUploadShown(): boolean {
  const { featureOn, mayTry } = useAuth();
  return showsUpload(featureOn, mayTry);
}
