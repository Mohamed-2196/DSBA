import { useCallback, useEffect, useRef, useState } from 'react';
import { answer, greeting } from './brain';

const BURST_EVERY = 24; // ms between bursts of characters while a reply streams in
const BURSTS = 60; // a reply takes about this many bursts, however long it is
const AFTERGLOW = 3200; // ms her mood lingers once she has finished

/** What she says she is doing while she "reads" a message. */
function thinkingLabel(attachments) {
  if (attachments.some((a) => a.kind === 'image')) return 'Reading your photo…';
  if (attachments.length) return 'Reading your file…';
  return 'Thinking…';
}

/** How long she takes before answering (0.9 to 1.4 s). Never random: the same message always takes as long. */
function thinkingTime(text, attachments) {
  if (attachments.some((a) => a.kind === 'image')) return 1300;
  if (attachments.length) return 1150;
  return 900 + Math.min(400, text.length * 8);
}

/**
 * The conversation with Mini Noora: the messages so far, and the reply that is on its way.
 *
 * A reply goes through three phases, held in `pending`:
 *   { phase: 'thinking', label, reply }      the dots, and a line such as "Reading your photo…"
 *   { phase: 'typing', reply, shown }        the reply is in the list and streams in; `shown` characters so far
 *   { phase: 'done', reply }                 it is all there; her mood lingers for a moment
 * and then `pending` is null again.
 *
 * @param year  the year the student is browsing (the brain uses it to break ties)
 * @param calm  reduced motion: replies appear whole instead of streaming
 * @returns {{ messages, pending, busy, send }}
 *   messages  [{ id, from: 'noora'|'me', text, attachments?, mood?, formula?, steps?, refs?, suggestions? }]
 *   busy      she is still answering; send() does nothing until she has finished
 *   send({ text, attachments }) → true if the message was taken
 */
export function useChat({ year, calm }) {
  const [messages, setMessages] = useState(() => [{ id: 1, from: 'noora', ...greeting() }]);
  const [pending, setPending] = useState(null);
  const lastId = useRef(1);
  const busy = Boolean(pending) && pending.phase !== 'done';
  const answering = useRef(false);
  useEffect(() => {
    answering.current = busy;
  }, [busy]);

  const send = useCallback(
    ({ text, attachments = [] }) => {
      if (answering.current) return false;
      answering.current = true;
      const mine = { id: (lastId.current += 1), from: 'me', text, attachments };
      const reply = { id: (lastId.current += 1), from: 'noora', ...answer({ text, attachments, year }) };
      setMessages((list) => [...list, mine]);
      setPending({ phase: 'thinking', label: thinkingLabel(attachments), wait: thinkingTime(text, attachments), reply });
      return true;
    },
    [year],
  );

  // One clock moves a reply through its phases.
  useEffect(() => {
    if (!pending) return undefined;
    const { phase, reply } = pending;
    let wait = AFTERGLOW;
    let next = () => setPending(null);
    if (phase === 'thinking') {
      wait = pending.wait;
      next = () => {
        setMessages((list) => [...list, reply]);
        setPending(calm ? { phase: 'done', reply } : { phase: 'typing', reply, shown: 0 });
      };
    } else if (phase === 'typing') {
      // Count characters, not code units, so an emoji is never cut in half.
      const total = Array.from(reply.text).length;
      const shown = pending.shown + Math.max(2, Math.ceil(total / BURSTS));
      wait = BURST_EVERY;
      next = () => setPending(shown >= total ? { phase: 'done', reply } : { phase: 'typing', reply, shown });
    }
    const timer = setTimeout(next, wait);
    return () => clearTimeout(timer);
  }, [pending, calm]);

  return { messages, pending, busy, send };
}
