// First visit (decision D7): the page a link leads to always shows. While no year is
// chosen, a small prompt in the corner asks for one, with "I'm not a student" and "Sign in" beside it (YearPrompt);
// the three-step tour of what's new opens only when asked for (Tour). The year is saved the moment it is picked
// (in this browser, and on the account of a signed-in student without one).
//
// It tells the rest of the app what is up on <html data-onboarding>: 'prompt' while the prompt shows, 'open'
// while the tour does (Home holds its load animation for the tour; Mini Noora keeps her hint back for both), with
// a 'hub:onboarding' event on every change.
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth';
import { errorMessage } from '../../api/errors';
import { useToast, useYear, type CohortYear } from '../../state';
import { useSaveCohort } from './api';
import { Tour } from './Tour';
import { YearPrompt, type PromptStage } from './YearPrompt';
import './Onboarding.css';

// "I'm not a student" is kept on this device; "Not now" lasts for this visit.
const NOT_STUDENT_KEY = 'hub.onboarding.notStudent';
const LATER_KEY = 'hub.onboarding.later';

function readFlag(storage: () => Storage, key: string): boolean {
  try {
    return storage().getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(storage: () => Storage, key: string): void {
  try {
    storage().setItem(key, '1');
  } catch {
    /* storage refused: the choice lasts until the page is reloaded */
  }
}

/** Puts the keyboard back on the page once the prompt has gone (the button that was pressed went with it). */
const focusPage = () => requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));

export function Onboarding() {
  const { year, setYear } = useYear();
  const { me, status, openSignIn } = useAuth();
  const { push } = useToast();
  const save = useSaveCohort();
  const [notStudent, setNotStudent] = useState(() => readFlag(() => window.localStorage, NOT_STUDENT_KEY));
  const [later, setLater] = useState(() => readFlag(() => window.sessionStorage, LATER_KEY));
  // After a year is picked, the prompt asks about the tour until it is answered.
  const [picked, setPicked] = useState<CohortYear | null>(null);
  const [touring, setTouring] = useState(false);

  const signedIn = status === 'signed-in' && !!me;
  const stage: PromptStage | null =
    status === 'loading' ? null : picked ? 'set' : year == null && !notStudent && !later ? 'year' : null;
  const showPrompt = stage !== null && !touring;
  const signal = touring ? 'open' : showPrompt ? 'prompt' : null;

  useEffect(() => {
    const root = document.documentElement;
    if (signal) root.dataset.onboarding = signal;
    else delete root.dataset.onboarding;
    window.dispatchEvent(new CustomEvent('hub:onboarding', { detail: { state: signal } }));
  }, [signal]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.onboarding;
    },
    [],
  );

  const choose = (y: CohortYear) => {
    setYear(y);
    setPicked(y);
    // A signed-in student without a cohort keeps it on their account.
    if (signedIn && !me.needsProfile && me.year !== y) {
      save.mutate(y, {
        onError: (e) =>
          push({
            tone: 'alert',
            title: 'Your year wasn’t saved to your account',
            body: `${errorMessage(e, 'It’s set on this device.')} You can change it in your account settings.`,
          }),
      });
    }
  };
  const done = () => {
    setPicked(null);
    focusPage();
  };

  return (
    <>
      {showPrompt && stage ? (
        <YearPrompt
          stage={stage}
          year={picked}
          signedIn={signedIn}
          busy={save.isPending}
          onChoose={choose}
          onNotStudent={() => {
            writeFlag(() => window.localStorage, NOT_STUDENT_KEY);
            setNotStudent(true);
            focusPage();
          }}
          onSignIn={() => openSignIn()}
          onLater={() => {
            writeFlag(() => window.sessionStorage, LATER_KEY);
            setLater(true);
            focusPage();
          }}
          onTour={() => setTouring(true)}
          onDone={done}
        />
      ) : null}
      <Tour
        open={touring}
        year={picked ?? year}
        onClose={() => {
          setTouring(false);
          done();
        }}
      />
    </>
  );
}
