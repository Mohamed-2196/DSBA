import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import type { Message } from './types';
import { declinedReply, fallback, historyOf, lastQuestionAt, stoppedReply, type Pending } from './useChat';

describe('fallback', () => {
  it('pauses her AI for the visit when the day or the month is used up', () => {
    expect(fallback(new ApiError({ status: 429, code: 'noora_daily_limit', message: '' }))).toMatchObject({
      pause: 'limit',
    });
    expect(fallback(new ApiError({ status: 503, code: 'noora_budget_reached', message: '' }))).toMatchObject({
      pause: 'budget',
    });
    expect(fallback(new ApiError({ status: 503, code: 'noora_unavailable', message: '' }))).toMatchObject({
      pause: 'off',
    });
  });

  it('keeps trying after a hiccup', () => {
    expect(fallback(new ApiError({ status: 429, code: 'rate_limited', message: '' })).pause).toBeNull();
    expect(fallback(new ApiError({ status: 503, code: 'noora_busy', message: '' })).pause).toBeNull();
    expect(fallback(new ApiError({ status: 0, code: 'network', message: '' })).pause).toBeNull();
    expect(fallback(new Error('cut off')).notice).toMatch(/from my script/);
  });
});

describe('declinedReply', () => {
  it('is her plain message only: no retry, no notice, no cards', () => {
    const reply = declinedReply('I can’t help with that one.', 7, 5);
    expect(reply).toEqual({
      id: 7,
      from: 'noora',
      at: 5,
      mood: 'neutral',
      text: 'I can’t help with that one.',
      refs: [],
      declined: true,
    });
    expect(reply).not.toHaveProperty('retry');
    expect(reply).not.toHaveProperty('ai');
  });
});

describe('historyOf', () => {
  it('sends the newest messages with words in them', () => {
    const messages: Message[] = Array.from({ length: 10 }, (_, i) =>
      i % 2
        ? { id: i, from: 'noora', at: 0, mood: 'neutral', text: `answer ${i}`, refs: [] }
        : { id: i, from: 'me', at: 0, text: i === 8 ? '' : `question ${i}`, attachments: [] },
    );
    const history = historyOf(messages);
    expect(history).toHaveLength(8);
    expect(history[0]).toEqual({ role: 'noora', text: 'answer 1' });
    expect(history.at(-1)).toEqual({ role: 'noora', text: 'answer 9' });
    expect(history.some((t) => t.text === '')).toBe(false);
  });
});

describe('lastQuestionAt', () => {
  it('finds the newest question', () => {
    const messages: Message[] = [
      { id: 1, from: 'me', at: 0, text: 'a', attachments: [] },
      { id: 2, from: 'noora', at: 0, mood: 'neutral', text: 'b', refs: [] },
    ];
    expect(lastQuestionAt(messages)).toBe(0);
    expect(lastQuestionAt([])).toBe(-1);
  });
});

describe('stoppedReply', () => {
  const question = { text: 'q', attachments: [], year: null };

  it('keeps what her AI had said, with its cards, marked as stopped', () => {
    const reply = { id: 4, from: 'noora' as const, at: 9, mood: 'neutral' as const, text: 'See', refs: [], ai: true };
    const pending: Pending = { phase: 'typing', reply, shown: 3, live: true };
    expect(stoppedReply(pending, 'See [the calendar](/calendar) and [the le', [], 10)).toMatchObject({
      id: 4,
      at: 9,
      ai: true,
      text: 'See [the calendar](/calendar) and',
      refs: [{ to: '/calendar' }],
      notice: 'You stopped this answer.',
    });
  });

  it('cuts a scripted answer where it had got to', () => {
    const reply = {
      id: 4,
      from: 'noora' as const,
      at: 9,
      mood: 'happy' as const,
      text: 'Hello there',
      refs: [{ code: 'Hub', label: 'x', to: '/x' }],
    };
    expect(stoppedReply({ phase: 'typing', reply, shown: 5 }, '', [], 10)).toMatchObject({ text: 'Hello', refs: [] });
  });

  it('says so when nothing had arrived, and leaves a finished answer alone', () => {
    const thinking: Pending = { phase: 'thinking', label: '', wait: 0, since: 0, question, replyId: 6, ai: true };
    expect(stoppedReply(thinking, '', [], 10)).toMatchObject({ id: 6, text: '', notice: 'You stopped this answer.' });
    const reply = { id: 4, from: 'noora' as const, at: 9, mood: 'happy' as const, text: 'Done', refs: [] };
    expect(stoppedReply({ phase: 'done', reply }, '', [], 10)).toBeNull();
  });
});
