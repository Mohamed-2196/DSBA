import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isApiError } from '../../api/errors';
import type { ModuleSummary, NooraQuestion, NooraTurn } from '../../api/types';
import { AnswerCutOff, askNoora } from './ai';
import { replyFromAnswer, visibleText } from './answer';
import { answer, greeting } from './brain';
import { release, type Attachment } from './files';
import { useKnowledge } from './knowledge';
import type { Message, MyMessage, NooraMessage, Question, Reply } from './types';

const BURST_EVERY = 24; // ms between bursts of characters while a reply streams in
const BURSTS = 60; // a reply takes about this many bursts, however long it is
const AFTERGLOW = 3200; // ms her mood lingers once she has finished
const MAX_WAIT = 6000; // ms she waits for the lessons and the calendar before answering with what she has
const HISTORY = 8; // earlier messages sent with a question to her AI (the API takes at most 8)
const TURN_MAX = 4000; // characters of each (the API's limit)

/** What she says while she works on a message. Never "Reading your photo…": she can't see pictures (ST-3). */
const THINKING = 'Thinking…';

/** How long she takes before answering (0.9 to 1.4 s). Never random: the same message always takes as long. */
function thinkingTime(text: string, attachments: readonly Attachment[]): number {
  if (attachments.some((a) => a.kind === 'image')) return 1300;
  if (attachments.length) return 1150;
  return 900 + Math.min(400, text.length * 8);
}

/**
 * The reply on its way:
 *   thinking   the dots and "Thinking…". From her script: the answer is worked out when it ends. From her AI
 *              (`ai`): it ends when the first words arrive.
 *   typing     the reply is in the list and streams in; `shown` characters so far. `live`: the words come from her
 *              AI as they arrive, not from the script's clock.
 *   done       it is all there; her mood lingers for a moment
 * and then null again.
 */
export type Pending =
  | { phase: 'thinking'; label: string; wait: number; since: number; question: Question; replyId: number; ai: boolean; notice?: string }
  | { phase: 'typing'; reply: NooraMessage; shown: number; live?: boolean }
  | { phase: 'done'; reply: NooraMessage };

/** Her AI, while it's on for the student. */
export interface ChatAi {
  /** the request for a question: what's on the screen when it is sent */
  question: (text: string, history: NooraTurn[]) => NooraQuestion;
  /** the module catalogue (her links' cards show unit codes) */
  modules: readonly ModuleSummary[];
  /** an answer arrived: the questions left today */
  onAnswered: (questionsLeft: number) => void;
}

export interface Chat {
  /** what she says before anything has been asked (shown as the chat's empty state) */
  greeting: Reply;
  messages: Message[];
  pending: Pending | null;
  /** she is still answering; send() does nothing until she has finished */
  busy: boolean;
  /** her AI stopped for this visit (today's questions are used up, the budget is spent...): she uses her script */
  aiPaused: boolean;
  /** true if the message was taken */
  send: (message: { text: string; attachments?: Attachment[] }) => boolean;
  /** start again: every message goes, and an answer on its way is dropped */
  clear: () => void;
}

/** Why an answer comes from her script instead of her AI, and whether to stop asking her AI for this visit. */
export function fallback(e: unknown): { notice: string; pause: boolean } {
  const code = isApiError(e) ? e.code : null;
  if (code === 'noora_daily_limit') return { notice: 'You’ve used today’s AI questions, so this answer is from my script. Ask again tomorrow.', pause: true };
  if (code === 'noora_budget_reached') return { notice: 'My AI answers are paused until next month, so this answer is from my script.', pause: true };
  if (code === 'rate_limited') return { notice: 'One question at a time, so this answer is from my script.', pause: false };
  const pause = code === 'noora_unavailable' || code === 'feature_off' || code === 'unauthenticated' || code === 'forbidden';
  return { notice: 'I can’t reach my AI right now, so this answer is from my script.', pause };
}

/** The conversation so far, for a follow-up question: the newest messages with words in them. */
export function historyOf(messages: readonly Message[]): NooraTurn[] {
  return messages
    .filter((m) => m.text.trim())
    .slice(-HISTORY)
    .map((m) => ({ role: m.from === 'me' ? 'student' : 'noora', text: m.text.slice(0, TURN_MAX) }));
}

/**
 * The conversation with Mini Noora: the messages so far, and the reply that is on its way.
 * year: the year the student is browsing (the brain uses it to break ties). calm: reduced motion, scripted replies
 * appear whole instead of streaming. ai: her AI while it's on for the student; null: only her script, and nothing
 * leaves the browser. When her AI can't answer, her script does, with a short notice.
 */
export function useChat({ year, calm, ai }: { year: number | null; calm: boolean; ai: ChatAi | null }): Chat {
  const { knowledge, ready } = useKnowledge();
  const latest = useRef(knowledge);
  useEffect(() => {
    latest.current = knowledge;
  }, [knowledge]);
  const aiRef = useRef(ai);
  useEffect(() => {
    aiRef.current = ai;
  }, [ai]);

  const hello = useMemo(() => greeting(knowledge.name), [knowledge.name]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [aiPaused, setAiPaused] = useState(false);
  const lastId = useRef(0);
  const busy = Boolean(pending) && pending?.phase !== 'done';
  const answering = useRef(false);
  useEffect(() => {
    answering.current = busy;
  }, [busy]);
  const shown = useRef(messages);
  useEffect(() => {
    shown.current = messages;
  }, [messages]);
  const asking = useRef<AbortController | null>(null);
  useEffect(() => () => asking.current?.abort(), []);

  /** Puts her reply in the list, or replaces the one with its id (an answer that is still arriving). */
  const put = useCallback((reply: NooraMessage) => {
    setMessages((list) => (list.some((m) => m.id === reply.id) ? list.map((m) => (m.id === reply.id ? reply : m)) : [...list, reply]));
  }, []);

  const askAi = useCallback(
    (now: ChatAi, question: Question, replyId: number, history: NooraTurn[]) => {
      const controller = new AbortController();
      asking.current = controller;
      let full = '';
      const at = Date.now();
      const finish = (reply: Reply) => {
        const message: NooraMessage = { id: replyId, from: 'noora', at, ...reply };
        put(message);
        setPending({ phase: 'done', reply: message });
      };
      askNoora(
        now.question(question.text, history),
        (piece) => {
          full += piece;
          const reply: NooraMessage = { id: replyId, from: 'noora', at, mood: 'neutral', text: visibleText(full), refs: [] };
          put(reply);
          setPending({ phase: 'typing', reply, shown: Array.from(reply.text).length, live: true });
        },
        controller.signal,
      )
        .then((left) => {
          finish(replyFromAnswer(full, now.modules));
          now.onAnswered(left);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          if (e instanceof AnswerCutOff && e.said) {
            finish({ ...replyFromAnswer(full, now.modules), mood: 'sad', notice: e.message });
            return;
          }
          const { notice, pause } = fallback(e);
          if (pause) setAiPaused(true);
          setPending({ phase: 'thinking', label: THINKING, wait: 0, since: Date.now(), question, replyId, ai: false, notice });
        });
    },
    [put],
  );

  const send = useCallback<Chat['send']>(
    ({ text, attachments = [] }) => {
      if (answering.current) return false;
      answering.current = true;
      lastId.current += 1;
      const mine: MyMessage = { id: lastId.current, from: 'me', at: Date.now(), text, attachments };
      lastId.current += 1;
      const replyId = lastId.current;
      const question: Question = { text, attachments, year };
      const now = aiRef.current;
      // Her AI reads words only: a message of only pictures or files goes to her script.
      const toAi = now !== null && !aiPaused && text.trim().length > 0;
      const history = historyOf(shown.current);
      setMessages((list) => [...list, mine]);
      setPending({ phase: 'thinking', label: THINKING, wait: thinkingTime(text, attachments), since: Date.now(), question, replyId, ai: toAi });
      if (toAi) askAi(now, question, replyId, history);
      return true;
    },
    [year, aiPaused, askAi],
  );

  // One clock moves a scripted reply through its phases. While she thinks, it also waits for her material to
  // arrive. An answer from her AI moves itself (askAi): the clock only lets her mood linger once it is done.
  const thinkingReady = pending?.phase === 'thinking' && ready;
  useEffect(() => {
    if (!pending) return undefined;
    if ((pending.phase === 'thinking' && pending.ai) || (pending.phase === 'typing' && pending.live)) return undefined;
    let wait = AFTERGLOW;
    let next = () => setPending(null);
    if (pending.phase === 'thinking') {
      const { question, replyId, notice } = pending;
      const elapsed = Date.now() - pending.since;
      wait = Math.max(0, (thinkingReady ? pending.wait : Math.max(pending.wait, MAX_WAIT)) - elapsed);
      next = () => {
        const reply: NooraMessage = { id: replyId, from: 'noora', at: Date.now(), ...answer(question, latest.current), ...(notice ? { notice } : {}) };
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

  const clear = useCallback(() => {
    asking.current?.abort();
    // The pictures go with the messages that carried them.
    for (const m of shown.current) if (m.from === 'me') m.attachments.forEach(release);
    setMessages([]);
    setPending(null);
    answering.current = false;
  }, []);

  return { greeting: hello, messages, pending, busy, aiPaused, send, clear };
}
