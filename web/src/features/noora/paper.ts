// A past paper's question the student asks Mini Noora about (IDEA-4). The file viewer sets it and opens her chat;
// her chat sends it with each question until the student takes it off or clears the chat. The API reads the page's
// words and the examiners' report for the same sitting itself: only the paper's id, the page and the number go.
import { useSyncExternalStore } from 'react';
import { useAuth } from '../../auth';
import { useNooraStatus } from './ai';
import { openCard } from './open';
import { useMiniNooraHidden } from './visibility';

export interface PaperAsk {
  itemId: string;
  title: string;
  /** where the question is in the PDF, from 1 */
  page: number;
  /** its number as the paper prints it: "2(b)" */
  question: string;
}

export const PAGE_MAX = 999; // the API's limits
const QUESTION_MAX = 16;
const QUESTION = /^[0-9A-Za-z][0-9A-Za-z().]*$/;

interface Snapshot {
  paper: PaperAsk | null;
  /** goes up each time the student asks about a question, so the chat can fill its box once */
  asked: number;
}

let snapshot: Snapshot = { paper: null, asked: 0 };
const listeners = new Set<() => void>();

function set(next: Snapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

/**
 * A question's number as the API takes it: spaces and a leading "Q" or "Question" go ("Q 2 (b)" is "2(b)").
 * null when what is left isn't a question's number.
 */
export function questionNumber(raw: string): string | null {
  const s = raw.replace(/\s+/g, '').replace(/^(question|q)\.?/i, '');
  return s.length <= QUESTION_MAX && QUESTION.test(s) ? s : null;
}

/** Ask Mini Noora about a paper's question: opens her chat with it. `from` gets focus back when it closes. */
export function askAboutPaper(paper: PaperAsk, from: HTMLElement | null = null): void {
  set({ paper, asked: snapshot.asked + 1 });
  openCard(from);
}

/** Stop sending the paper with her questions. */
export function clearPaperAsk(): void {
  if (snapshot.paper) set({ ...snapshot, paper: null });
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const server: Snapshot = { paper: null, asked: 0 };

/** The paper's question her chat sends, kept up to date. */
export function usePaperAsk(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => server,
  );
}

/** Whether her AI answers can take a paper's question now: she is shown, her AI is on for the student and working. */
export function useNooraAiReady(): boolean {
  const { featureOn, me } = useAuth();
  const hidden = useMiniNooraHidden();
  const on = featureOn('noora') && featureOn('noora.ai') && !hidden && me?.status === 'active' && !me.needsProfile;
  const status = useNooraStatus(on);
  return on && status.data?.available === true && status.data.questionsLeft > 0;
}
