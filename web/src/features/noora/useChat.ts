import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isApiError } from '../../api/errors';
import type { ModuleSummary, NooraQuestion, NooraScript, NooraTurn } from '../../api/types';
import { AnswerCutOff, streamAnswer } from './ai';
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
  | {
      phase: 'thinking';
      label: string;
      wait: number;
      since: number;
      question: Question;
      replyId: number;
      ai: boolean;
      notice?: string;
      retry?: boolean;
    }
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
  /** why her AI stopped for this visit (today's questions are used up, the budget is spent...): she uses her script */
  paused: Pause | null;
  /** true if the message was taken. `edit`: the id of a question it replaces, with everything after it */
  send: (message: { text: string; attachments?: Attachment[]; edit?: number | null }) => boolean;
  /** stop the answer on its way: what has arrived stays, marked as stopped */
  stop: () => void;
  /** ask the last question again: her last answer goes */
  regenerate: () => void;
  /** start again: every message goes, and an answer on its way is dropped */
  clear: () => void;
  /** carry on with a saved conversation */
  load: (messages: Message[]) => void;
}

/** Why her AI is paused for the visit. */
export type Pause = 'limit' | 'budget' | 'off';

const STOPPED = 'You stopped this answer.';

/** Why an answer comes from her script instead of her AI, and whether to stop asking her AI for this visit. */
export function fallback(e: unknown): { notice: string; pause: Pause | null } {
  const code = isApiError(e) ? e.code : null;
  if (code === 'noora_daily_limit')
    return {
      notice: 'You’ve used today’s AI questions, so this answer is from my script. Ask again tomorrow.',
      pause: 'limit',
    };
  if (code === 'noora_budget_reached')
    return { notice: 'My AI answers are paused until next month, so this answer is from my script.', pause: 'budget' };
  if (code === 'rate_limited')
    return { notice: 'One question at a time, so this answer is from my script.', pause: null };
  if (code === 'noora_busy')
    return { notice: 'Lots of students are asking me right now, so this answer is from my script.', pause: null };
  const off =
    code === 'noora_unavailable' || code === 'feature_off' || code === 'unauthenticated' || code === 'forbidden';
  return { notice: 'I couldn’t reach my AI, so this answer is from my script.', pause: off ? 'off' : null };
}

/** The conversation so far, for a follow-up question: the newest messages with words in them. */
export function historyOf(messages: readonly Message[]): NooraTurn[] {
  return messages
    .filter((m) => m.text.trim())
    .slice(-HISTORY)
    .map((m) => ({ role: m.from === 'me' ? 'student' : 'noora', text: m.text.slice(0, TURN_MAX) }));
}

/** Where the last question is (-1: none yet). */
export function lastQuestionAt(messages: readonly Message[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].from === 'me') return i;
  return -1;
}

/** The reply on its way, stopped where it is: what has arrived, marked as stopped. */
export function stoppedReply(
  pending: Pending,
  partial: string,
  modules: readonly ModuleSummary[],
  at: number,
): NooraMessage | null {
  if (pending.phase === 'done') return null;
  if (pending.phase === 'thinking')
    return {
      id: pending.replyId,
      from: 'noora',
      at,
      mood: 'neutral',
      text: '',
      refs: [],
      notice: STOPPED,
      ai: pending.ai,
    };
  const { reply } = pending;
  if (pending.live)
    return {
      ...replyFromAnswer(visibleText(partial), modules),
      id: reply.id,
      from: 'noora',
      at: reply.at,
      ai: true,
      notice: STOPPED,
    };
  return {
    ...reply,
    text: Array.from(reply.text).slice(0, pending.shown).join(''),
    formula: undefined,
    steps: undefined,
    refs: [],
    suggestions: undefined,
    notice: STOPPED,
  };
}

const highestId = (messages: readonly Message[]): number => messages.reduce((top, m) => Math.max(top, m.id), 0);

/**
 * The conversation with Mini Noora: the messages so far, and the reply that is on its way.
 * year: the year the student is browsing (the brain uses it to break ties). calm: reduced motion, scripted replies
 * appear whole instead of streaming. ai: her AI while it's on for the student; null: only her script, and nothing
 * leaves the browser. When her AI can't answer, her script does, with a short notice. initial: a conversation to
 * carry on with. script: what she says in her own words.
 */
export function useChat({
  year,
  calm,
  ai,
  script,
  initial = [],
}: {
  year: number | null;
  calm: boolean;
  ai: ChatAi | null;
  script: NooraScript;
  initial?: Message[];
}): Chat {
  const { knowledge, ready } = useKnowledge(script);
  const latest = useRef(knowledge);
  useEffect(() => {
    latest.current = knowledge;
  }, [knowledge]);
  const aiRef = useRef(ai);
  useEffect(() => {
    aiRef.current = ai;
  }, [ai]);

  const hello = useMemo(() => greeting(knowledge.name, script), [knowledge.name, script]);
  const [messages, setMessages] = useState<Message[]>(initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [paused, setPaused] = useState<Pause | null>(null);
  const lastId = useRef(highestId(initial));
  const busy = Boolean(pending) && pending?.phase !== 'done';
  const answering = useRef(false);
  useEffect(() => {
    answering.current = busy;
  }, [busy]);
  const shown = useRef(messages);
  useEffect(() => {
    shown.current = messages;
  }, [messages]);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const asking = useRef<AbortController | null>(null);
  const partial = useRef(''); // her AI's answer so far, as it arrived
  useEffect(() => () => asking.current?.abort(), []);

  /** Puts her reply in the list, or replaces the one with its id (an answer that is still arriving). */
  const put = useCallback((reply: NooraMessage) => {
    setMessages((list) =>
      list.some((m) => m.id === reply.id) ? list.map((m) => (m.id === reply.id ? reply : m)) : [...list, reply],
    );
  }, []);

  const askAi = useCallback(
    (now: ChatAi, question: Question, replyId: number, history: NooraTurn[]) => {
      const controller = new AbortController();
      asking.current = controller;
      partial.current = '';
      const at = Date.now();
      const finish = (reply: NooraMessage) => {
        put(reply);
        setPending({ phase: 'done', reply });
      };
      streamAnswer(
        now.question(question.text, history),
        (piece) => {
          partial.current += piece;
          const reply: NooraMessage = {
            id: replyId,
            from: 'noora',
            at,
            mood: 'neutral',
            text: visibleText(partial.current),
            refs: [],
            ai: true,
          };
          put(reply);
          setPending({ phase: 'typing', reply, shown: Array.from(reply.text).length, live: true });
        },
        controller.signal,
      )
        .then((left) => {
          finish({ ...replyFromAnswer(partial.current, now.modules), id: replyId, from: 'noora', at, ai: true });
          now.onAnswered(left);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          if (e instanceof AnswerCutOff && e.said) {
            finish({
              ...replyFromAnswer(partial.current, now.modules),
              id: replyId,
              from: 'noora',
              at,
              ai: true,
              mood: 'sad',
              notice: e.message,
              retry: true,
            });
            return;
          }
          const { notice, pause } = fallback(e);
          if (pause) setPaused(pause);
          setPending({
            phase: 'thinking',
            label: THINKING,
            wait: 0,
            since: Date.now(),
            question,
            replyId,
            ai: false,
            notice,
            retry: !pause,
          });
        });
    },
    [put],
  );

  /** Asks `text` after the messages in `base` (the conversation so far, or less of it when a question is redone). */
  const ask = useCallback(
    (base: Message[], text: string, attachments: Attachment[]): boolean => {
      if (answering.current) return false;
      answering.current = true;
      lastId.current = Math.max(lastId.current, highestId(base)) + 1;
      const mine: MyMessage = { id: lastId.current, from: 'me', at: Date.now(), text, attachments };
      lastId.current += 1;
      const replyId = lastId.current;
      const question: Question = { text, attachments, year };
      const now = aiRef.current;
      // Her AI reads words only: a message of only pictures or files goes to her script.
      const toAi = now !== null && !pausedRef.current && text.trim().length > 0;
      setMessages([...base, mine]);
      setPending({
        phase: 'thinking',
        label: THINKING,
        wait: thinkingTime(text, attachments),
        since: Date.now(),
        question,
        replyId,
        ai: toAi,
      });
      if (toAi) askAi(now, question, replyId, historyOf(base));
      return true;
    },
    [year, askAi],
  );

  const send = useCallback<Chat['send']>(
    ({ text, attachments = [], edit = null }) => {
      const list = shown.current;
      const at = edit == null ? -1 : list.findIndex((m) => m.id === edit && m.from === 'me');
      if (at < 0) return ask(list, text, attachments);
      // An edited question keeps the pictures the first one carried; what came after it goes.
      const before = list[at];
      const kept = before.from === 'me' ? before.attachments : [];
      return ask(list.slice(0, at), text, [...kept, ...attachments]);
    },
    [ask],
  );

  const regenerate = useCallback(() => {
    const list = shown.current;
    const at = lastQuestionAt(list);
    const question = list[at];
    if (!question || question.from !== 'me') return;
    ask(list.slice(0, at), question.text, question.attachments);
  }, [ask]);

  const stop = useCallback(() => {
    const now = pendingRef.current;
    if (!now) return;
    asking.current?.abort();
    asking.current = null;
    const reply = stoppedReply(now, partial.current, aiRef.current?.modules ?? [], Date.now());
    if (!reply) return;
    put(reply);
    setPending({ phase: 'done', reply });
    answering.current = false;
  }, [put]);

  // One clock moves a scripted reply through its phases. While she thinks, it also waits for her material to
  // arrive. An answer from her AI moves itself (askAi): the clock only lets her mood linger once it is done.
  const thinkingReady = pending?.phase === 'thinking' && ready;
  useEffect(() => {
    if (!pending) return undefined;
    if ((pending.phase === 'thinking' && pending.ai) || (pending.phase === 'typing' && pending.live)) return undefined;
    let wait = AFTERGLOW;
    let next = () => setPending(null);
    if (pending.phase === 'thinking') {
      const { question, replyId, notice, retry } = pending;
      const elapsed = Date.now() - pending.since;
      wait = Math.max(0, (thinkingReady ? pending.wait : Math.max(pending.wait, MAX_WAIT)) - elapsed);
      next = () => {
        const reply: NooraMessage = {
          id: replyId,
          from: 'noora',
          at: Date.now(),
          ...answer(question, latest.current),
          ...(notice ? { notice } : {}),
          ...(retry ? { retry } : {}),
        };
        put(reply);
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
  }, [pending, calm, thinkingReady, put]);

  const clear = useCallback(() => {
    asking.current?.abort();
    asking.current = null;
    // The pictures go with the messages that carried them.
    for (const m of shown.current) if (m.from === 'me') m.attachments.forEach(release);
    setMessages([]);
    setPending(null);
    answering.current = false;
  }, []);

  const load = useCallback(
    (saved: Message[]) => {
      clear();
      lastId.current = highestId(saved);
      setMessages(saved);
    },
    [clear],
  );

  return { greeting: hello, messages, pending, busy, paused, send, stop, regenerate, clear, load };
}
