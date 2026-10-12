// UX-3: a copy of unsaved edits stays on this device while the editor has them, so closing the tab, the back button
// or a crash loses nothing. Opening the editor again offers them back. The key starts with 'hub.mine.', so signing
// out clears it with the other personal keys (shared lab computers: security review, finding 23).
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IssueCover, IssueDetail, IssueSection } from '../../../api/types';
import { draftFrom, sameContent, toUpdate, validate, type IssueContent, type IssueDraft } from '../lib/draft';

const keyOf = (issueId: string): string => `hub.mine.newsletter.${issueId}`;
const WRITE_AFTER = 600; // ms after the last change

interface StoredCopy {
  savedAt: number;
  content: Record<string, unknown>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string';

function isCover(v: unknown): v is IssueCover {
  return isRecord(v) && (v.tone === 'navy' || v.tone === 'paper') && Array.isArray(v.lines) && v.lines.every((l) => isRecord(l) && isText(l.section) && isText(l.text));
}

function readStored(issueId: string): StoredCopy | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(keyOf(issueId)) ?? 'null');
    return isRecord(raw) && typeof raw.savedAt === 'number' && isRecord(raw.content) ? { savedAt: raw.savedAt, content: raw.content } : null;
  } catch {
    return null;
  }
}

/** The stored edits as a draft of `detail`, or null when there are none or they can't be read (stored JSON is never trusted). */
function draftOfCopy(copy: StoredCopy, detail: IssueDetail): IssueDraft | null {
  const c = copy.content;
  const merged: IssueContent = {
    title: isText(c.title) ? c.title : detail.title,
    number: typeof c.number === 'number' ? c.number : detail.number,
    date: isText(c.date) ? c.date : detail.date,
    slug: isText(c.slug) ? c.slug : detail.slug,
    dek: isText(c.dek) ? c.dek : detail.dek,
    summary: isText(c.summary) ? c.summary : detail.summary,
    editors: Array.isArray(c.editors) && c.editors.every(isText) ? c.editors : detail.editors,
    cover: isCover(c.cover) ? c.cover : detail.cover,
    sections: Array.isArray(c.sections) && c.sections.every(isRecord) ? (c.sections as IssueSection[]) : detail.sections,
  };
  try {
    const draft = draftFrom(merged);
    // Anything of the wrong type shows up here, before the form ever sees it.
    toUpdate(draft);
    validate(draft);
    return draft;
  } catch {
    return null;
  }
}

function write(issueId: string, draft: IssueDraft): void {
  try {
    window.localStorage.setItem(keyOf(issueId), JSON.stringify({ savedAt: Date.now(), content: toUpdate(draft) }));
  } catch {
    /* storage full or unavailable: the edits are still in the page */
  }
}

function forget(issueId: string): void {
  try {
    window.localStorage.removeItem(keyOf(issueId));
  } catch {
    /* nothing was kept */
  }
}

export interface DraftCopy {
  /** edits kept from an earlier visit that the issue doesn't have, until they are restored or discarded */
  earlier: { savedAt: number; draft: IssueDraft } | null;
  /** take the earlier edits back into the editor (returns them) */
  restore: () => IssueDraft | null;
  discard: () => void;
  /** the edits were saved: nothing to keep */
  clear: () => void;
}

export function useDraftCopy(detail: IssueDetail, draft: IssueDraft, dirty: boolean): DraftCopy {
  const issueId = detail.id;
  // Read once, when the editor opens on this issue.
  const found = useMemo(() => {
    const copy = readStored(issueId);
    const earlierDraft = copy ? draftOfCopy(copy, detail) : null;
    return copy && earlierDraft && !sameContent(earlierDraft, draftFrom(detail)) ? { savedAt: copy.savedAt, draft: earlierDraft } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on opening: later versions of the issue don't bring an old copy back
  }, [issueId]);
  const [earlier, setEarlier] = useState(found);

  // Keep a copy while there are unsaved edits (not while an earlier copy waits for an answer: it would be lost).
  useEffect(() => {
    if (earlier) return undefined;
    if (!dirty) {
      forget(issueId);
      return undefined;
    }
    const t = window.setTimeout(() => write(issueId, draft), WRITE_AFTER);
    return () => window.clearTimeout(t);
  }, [issueId, draft, dirty, earlier]);

  const restore = useCallback(() => {
    const d = earlier?.draft ?? null;
    setEarlier(null);
    return d;
  }, [earlier]);
  const discard = useCallback(() => {
    forget(issueId);
    setEarlier(null);
  }, [issueId]);
  const clear = useCallback(() => {
    forget(issueId);
    setEarlier(null);
  }, [issueId]);

  return { earlier, restore, discard, clear };
}
