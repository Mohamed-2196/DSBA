import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from '../../../state';
import { DRAFT_KEY, draftOwner, hasText, type ThreadDraft, type ThreadForm } from './threadDraft';

export interface ThreadDraftOptions {
  /** who is writing: an account id, or null for a guest */
  viewer: string | null;
  /** the form the URL asks for (?category, ?module, ?title), which wins over a stored draft; null without presets */
  presets: ThreadForm | null;
  /** stored JSON as a form this viewer may continue, or null (lib/threadDraft.ts restoreDraft) */
  restore: (raw: unknown, viewer: string | null) => ThreadForm | null;
  /** a new, empty form */
  empty: () => ThreadForm;
}

/**
 * The composer's form, kept as a draft on this device while it has text (localStorage DRAFT_KEY, removed on sign-out
 * by auth/queries.ts). A draft is someone's: another account's stays stored and unseen (until this person writes
 * something of their own), and when its owner signs in while the composer is still untouched, it comes back.
 */
export function useThreadDraft({ viewer, presets, restore, empty }: ThreadDraftOptions) {
  const [raw, setStored] = useLocalStorage<unknown>(DRAFT_KEY, null);
  const [initial] = useState(() => {
    const draft = presets ? null : restore(raw, viewer);
    return { form: presets ?? draft ?? empty(), restored: !!draft };
  });
  const [form, setFormState] = useState<ThreadForm>(initial.form);
  const [restored, setRestored] = useState(initial.restored);
  // Nothing typed or chosen since the page opened.
  const pristine = useRef(!hasText(initial.form));
  // Another account's draft on this device stays where it is until this person writes something of their own.
  const othersDraft = useRef(draftOwner(raw, viewer) === 'other');
  // Posted or discarded: nothing is saved any more.
  const done = useRef(false);

  const setForm = useCallback((update: (f: ThreadForm) => ThreadForm) => {
    setFormState((prev) => {
      const next = update(prev);
      if (next !== prev) pristine.current = false; // (idempotent: safe when React calls this twice)
      return next;
    });
  }, []);

  useEffect(() => {
    if (done.current) return;
    if (hasText(form)) setStored({ ...form, savedAt: Date.now(), owner: viewer } satisfies ThreadDraft);
    else if (!othersDraft.current) setStored(undefined);
  }, [form, viewer, setStored]);

  // Someone signs in while the composer is still untouched: their own unfinished thread comes back.
  useEffect(() => {
    if (!viewer || !pristine.current) return;
    const draft = restore(raw, viewer);
    if (!draft) return;
    pristine.current = false;
    othersDraft.current = false;
    setFormState(draft);
    setRestored(true);
    // Only when the account changes: a draft saved while typing must never come back over the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  return {
    form,
    setForm,
    /** the form came from a stored draft ("We kept the draft you started earlier.") */
    restored,
    startOver: () => {
      setFormState(empty());
      setRestored(false);
    },
    /** posted or discarded: the draft goes */
    finish: () => {
      done.current = true;
      setStored(undefined);
    },
  };
}
