// Her AI for a chat (the card or the full page): whether it is on for the student, today's questions, and the
// ChatAi that useChat asks with. Each chat says what goes with a question (its page, a module, a note, a paper).
import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { NooraQuestion, NooraStatus, NooraTurn } from '../../api/types';
import { useAuth } from '../../auth';
import { useModules } from '../../state/modules';
import { NOORA_STATUS_KEY, useNooraStatus } from './ai';
import type { ChatAi, Pause } from './useChat';

/** What goes to her AI with a question, besides the question and the conversation. */
export type AskContext = Omit<NooraQuestion, 'question' | 'history'>;

export interface NooraAi {
  /** her AI is switched on for this student (signed in, active, profile done) */
  on: boolean;
  status: UseQueryResult<NooraStatus>;
  /** null: her script answers */
  ai: ChatAi | null;
}

/** Her AI while it can answer. `context` is read when a question is sent, so it may change between renders. */
export function useNooraAi(context: () => AskContext): NooraAi {
  const { featureOn, me } = useAuth();
  const { modules } = useModules();
  const on = featureOn('noora.ai') && me?.status === 'active' && !me.needsProfile;
  const status = useNooraStatus(on);
  const outOfQuestions = status.data !== undefined && status.data.questionsLeft <= 0;
  const ready = on && status.data?.available !== false && !outOfQuestions;
  const read = useRef(context);
  useEffect(() => {
    read.current = context;
  });
  const qc = useQueryClient();
  const ai = useMemo<ChatAi | null>(
    () =>
      ready
        ? {
            modules,
            question: (text: string, history: NooraTurn[]): NooraQuestion => ({
              ...read.current(),
              question: text,
              history,
            }),
            onAnswered: (left) =>
              qc.setQueryData<NooraStatus>(NOORA_STATUS_KEY, (old) => (old ? { ...old, questionsLeft: left } : old)),
          }
        : null,
    [ready, modules, qc],
  );
  return { on, status, ai };
}

/** Why her AI isn't answering (null: it is), from what the chat ran into and what the API says. */
export function pauseOf(on: boolean, paused: Pause | null, status: NooraStatus | undefined): Pause | null {
  if (!on) return null;
  if (paused) return paused;
  if (status?.available === false) return 'off';
  return status !== undefined && status.questionsLeft <= 0 ? 'limit' : null;
}

const SCRIPT_CAN = 'I answer from my script: modules, lessons, exam dates and where things are in the Hub.';

/** Why her AI isn't answering, said plainly, with what she can still do. */
export function pausedLine(why: Pause, status: NooraStatus | undefined): string {
  if (why === 'limit')
    return `You’ve used today’s ${status ? `${status.dailyQuestions} ` : ''}AI questions. Until tomorrow, ${SCRIPT_CAN}`;
  if (why === 'budget') return `My AI answers are paused until next month. Until then, ${SCRIPT_CAN}`;
  return `My AI answers aren’t available right now. ${SCRIPT_CAN}`;
}

/** "12 of 20 questions left today", or null while it isn't known. */
export function questionsLeftLine(status: NooraStatus | undefined): string | null {
  if (!status) return null;
  const left = Math.max(0, status.questionsLeft);
  return `${left.toLocaleString('en-GB')} of ${status.dailyQuestions.toLocaleString('en-GB')} ${status.dailyQuestions === 1 ? 'question' : 'questions'} left today`;
}
