// Her AI answers (the `noora.ai` feature): a question goes to POST /noora/ask with what's on the student's screen,
// and the answer streams back as Server-Sent Events. Without it, or when it can't answer, she uses her script.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ApiError } from '../../api/errors';
import type { NooraDoneEvent, NooraErrorEvent, NooraQuestion, NooraTextEvent } from '../../api/types';

type NooraEvent = NooraTextEvent | NooraDoneEvent | NooraErrorEvent;

const CUT_OFF = 'My answer was cut off. Try asking again in a minute.';

export const NOORA_STATUS_KEY = ['noora', 'status'] as const;

/** Whether her AI answers work for this student now, and how many questions are left today. */
export function useNooraStatus(enabled: boolean) {
  return useQuery({ queryKey: NOORA_STATUS_KEY, queryFn: () => call(api.GET('/api/v1/noora/status')), enabled, staleTime: 60_000 });
}

/** The answer stopped part-way (`said`: some of it had arrived). */
export class AnswerCutOff extends Error {
  constructor(
    message: string,
    readonly said: boolean,
  ) {
    super(message);
    this.name = 'AnswerCutOff';
  }
}

function parseEvent(block: string): NooraEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value === 'object' && value !== null && 'type' in value) return value as NooraEvent;
  } catch {
    // a broken line: skipped
  }
  return null;
}

/**
 * Reads an answer's event stream: `onText` gets each piece as it arrives. Resolves with the questions left today
 * when it is complete; throws AnswerCutOff when it stops part-way.
 */
export async function readAnswer(body: ReadableStream<Uint8Array>, onText: (text: string) => void, signal?: AbortSignal): Promise<number> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let said = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
      let end = buffer.indexOf('\n\n');
      while (end >= 0) {
        const event = parseEvent(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf('\n\n');
        if (!event) continue;
        if (event.type === 'text') {
          said = true;
          onText(event.text);
        } else if (event.type === 'done') {
          return event.questionsLeft;
        } else {
          throw new AnswerCutOff(event.message, said);
        }
      }
    }
  } catch (e) {
    if (e instanceof AnswerCutOff) throw e;
    if (signal?.aborted) throw new ApiError({ status: 0, code: 'aborted', message: 'Stopped.' });
    throw new AnswerCutOff(CUT_OFF, said);
  } finally {
    reader.releaseLock();
  }
  throw new AnswerCutOff(CUT_OFF, said);
}

/**
 * Ask her: the question with what's on the screen. Resolves with the questions left today. Throws an ApiError
 * before the answer starts (noora_unavailable, noora_budget_reached, noora_daily_limit, rate_limited, feature_off,
 * network...), or AnswerCutOff when it stops part-way.
 */
export async function askNoora(question: NooraQuestion, onText: (text: string) => void, signal?: AbortSignal): Promise<number> {
  const body = await call(api.POST('/api/v1/noora/ask', { body: question, parseAs: 'stream', signal }));
  if (!body) throw new AnswerCutOff(CUT_OFF, false);
  return readAnswer(body, onText, signal);
}
