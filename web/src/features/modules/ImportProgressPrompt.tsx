// After signing in, a student who has lesson progress saved in this browser (from before they signed in) is
// asked whether it is theirs: lab and library computers at BIBF are shared, so it may be someone else's.
// "Add to my account" merges it (POST /me/progress/import) and clears the browser's copy; "Leave it out"
// clears it; closing the dialog asks again on the next visit. Rendered by the pages that show progress.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { useModules } from '../../state/modules';
import { Button, Modal } from '../../ui';
import { importProgress, progressKey } from './api';
import { isEmptyProgress, toImport, useGuestProgress } from './progress';
import './ImportProgressPrompt.css';

// One prompt on screen, whichever page shows it first; "Not now" holds for the rest of the visit.
let claimed = false;
const notNow = new Set<string>();

export function ImportProgressPrompt() {
  const { me, status } = useAuth();
  const guest = useGuestProgress();
  const qc = useQueryClient();
  const { push } = useToast();
  const { getModule } = useModules();
  const [owner, setOwner] = useState(false);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (claimed) return undefined;
    claimed = true;
    setOwner(true);
    return () => {
      claimed = false;
    };
  }, []);

  const summary = useMemo(() => {
    const lessons = Object.keys(guest.state.watched).filter((k) => getModule(k.split(':')[0]));
    const modules = new Set([...lessons.map((k) => k.split(':')[0]), ...Object.keys(guest.state.last).filter((id) => getModule(id))]);
    return { lessons: lessons.length, modules: modules.size };
  }, [guest.state, getModule]);

  // Only once the person is fully signed in (the sign-in dialog has finished, profile included).
  const userId = status === 'signed-in' && me && !me.needsProfile ? me.id : null;
  const open = owner && !!userId && !closed && !notNow.has(userId) && !isEmptyProgress(guest.state) && summary.modules > 0;
  if (!userId) return null;

  const later = () => {
    notNow.add(userId);
    setClosed(true);
  };
  const leaveOut = () => {
    guest.clear();
    setClosed(true);
  };
  const add = () => {
    setBusy(true);
    setError(null);
    importProgress(toImport(guest.state))
      .then((data) => {
        qc.setQueryData(progressKey(userId), data);
        guest.clear();
        setClosed(true);
        push({ title: 'Lesson progress added', body: 'It’s saved to your account now, on every device.', tone: 'success' });
      })
      .catch((e: unknown) => setError(errorMessage(e, 'It couldn’t be added. Check your connection and try again.')))
      .finally(() => setBusy(false));
  };

  const what =
    summary.lessons > 0
      ? `someone marked ${summary.lessons} ${summary.lessons === 1 ? 'lesson' : 'lessons'} as watched on this computer`
      : `someone opened lessons in ${summary.modules} ${summary.modules === 1 ? 'module' : 'modules'} on this computer`;

  return (
    <Modal
      open={open}
      onClose={later}
      title="Is this lesson progress yours?"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={leaveOut} disabled={busy}>
            Leave it out
          </Button>
          <Button variant="primary" onClick={add} loading={busy} data-autofocus>
            Add to my account
          </Button>
        </>
      }
    >
      <p className="mod-import__text">
        Before you signed in, {what}. If that was you, add the progress to your account. If someone else used this computer, leave it
        out.
      </p>
      {error ? (
        <p className="mod-import__error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
