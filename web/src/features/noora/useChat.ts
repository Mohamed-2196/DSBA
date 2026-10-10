import { useCallback, useEffect, useRef, useState } from 'react';
import { answer, greeting } from './brain';
import type { Attachment } from './files';
import { useKnowledge } from './knowledge';
import type { Message, MyMessage, NooraMessage, Question } from './types';

const BURST_EVERY = 24; // ms between bursts of characters while a reply streams in
const BURSTS = 60; // a reply takes about this many bursts, however long it is
const AFTERGLOW = 3200; // ms her mood lingers once she has finished
const MAX_WAIT = 6000; // ms she waits for the lessons and the calendar before answering with what she has

/** What she says she is doing while she "reads" a message. */
function thinkingLabel(attachments: readonly Attachment[]): string {
  if (attachments.some((a) => a.kind === 'image')) return 'Reading your photo…';
  if (attachments.length) return 'Reading your file…';
  return 'Thinking…';
}

/** How long she takes before answering (0.9 to 1.4 s). Never random: the same message always takes as long. */
function thinkingTime(text: string, attachments: readonly Attachment[]): number {
  if (attachments.some((a) => a.kind === 'image')) return 1300;
  if (attachments.length) return 1150;
  return 900 + Math.min(400, text.length * 8);
}

/**
 * The reply on its way:
 *   thinking   the dots, and a line such as "Reading your photo…" (the answer is worked out when it ends)
 *   typing     the reply is in the list and streams in; `shown` characters so far
 *   done       it is all there; her mood lingers for a moment
 * and then null again.
 */
export type Pending =
  | { phase: 'thinking'; label: string; wait: number; since: number; question: Question; replyId: number }
  | { phase: 'typing'; reply: NooraMessage; shown: number }
  | { phase: 'done'; reply: NooraMessage };

export interface Chat {
  messages: Message[];
  pending: Pending | null;
  /** she is still answering; send() does nothing until she has finished */
  busy: boolean;
  /** true if the message was taken */
  send: (message: { text: string; attachments?: Attachment[] }) => boolean;
}

/**
 * The conversation with Mini Noora: the messages so far, and the reply that is on its way.
 * year: the year the student is browsing (the brain uses it to break ties). calm: reduced motion, replies appear
 * whole instead of streaming. Nothing here leaves the browser: the brain is a script over the Hub's own data.
 */
export function useChat({ year, calm }: { year: number | null; calm: boolean }): Chat {
  const { knowledge, ready } = useKnowledge();
  const latest = useRef(knowledge);
  useEffect(() => {
    latest.current = knowledge;
  }, [knowledge]);

  const [messages, setMessages] = useState<Message[]>(() => [{ id: 1, from: 'noora', ...greeting(knowledge.name) }]);
  const [pending, setPending] = useState<Pending | null>(null);
  const lastId = useRef(1);
  const busy = Boolean(pending) && pending?.phase !== 'done';
  const answering = useRef(false);
  useEffect(() => {
    answering.current = busy;
  }, [busy]);

  const send = useCallback<Chat['send']>(
    ({ text, attachments = [] }) => {
      if (answering.current) return false;
      answering.current = true;
      lastId.current += 1;
      const mine: MyMessage = { id: lastId.current, from: 'me', text, attachments };
      lastId.current += 1;
      const replyId = lastId.current;
      setMessages((list) => [...list, mine]);
      setPending({ phase: 'thinking', label: thinkingLabel(attachments), wait: thinkingTime(text, attachments), since: Date.now(), question: { text, attachments, year }, replyId });
      return true;
    },
    [year],
  );

  // One clock moves a reply through its phases. While she thinks, it also waits for her material to arrive.
  const thinkingReady = pending?.phase === 'thinking' && ready;
  useEffect(() => {
    if (!pending) return undefined;
    let wait = AFTERGLOW;
    let next = () => setPending(null);
    if (pending.phase === 'thinking') {
      const { question, replyId } = pending;
      const elapsed = Date.now() - pending.since;
      wait = Math.max(0, (thinkingReady ? pending.wait : Math.max(pending.wait, MAX_WAIT)) - elapsed);
      next = () => {
        const reply: NooraMessage = { id: replyId, from: 'noora', ...answer(question, latest.current) };
        setMessages((list) => [...list, reply]);
        setPending(calm ? { phase: 'done', reply } : { phase: 'typing', reply, shown: 0 });
      };
    } else if (pending.phase === 'typing') {
      const { reply } = pending;
      // Count characters, not code units, so an emoji is never cut in half.
      const total = Array.from(reply.text).length;
      const shown = pending.shown + Math.max(2, Math.ceil(total / BURSTS));
      wait = BURST_EVERY;
      next = () => setPending(shown >= total ? { phase: 'done', reply } : { phase: 'typing', reply, shown });
    }
    const timer = setTimeout(next, wait);
    return () => clearTimeout(timer);
  }, [pending, calm, thinkingReady]);

  return { messages, pending, busy, send };
}
