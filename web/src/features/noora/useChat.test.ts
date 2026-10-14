import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import type { Message } from './types';
import { fallback, historyOf } from './useChat';

describe('fallback', () => {
  it('pauses her AI for the visit when the day or the month is used up', () => {
    expect(fallback(new ApiError({ status: 429, code: 'noora_daily_limit', message: '' }))).toMatchObject({ pause: true });
    expect(fallback(new ApiError({ status: 503, code: 'noora_budget_reached', message: '' }))).toMatchObject({ pause: true });
    expect(fallback(new ApiError({ status: 503, code: 'noora_unavailable', message: '' }))).toMatchObject({ pause: true });
  });

  it('keeps trying after a hiccup', () => {
    expect(fallback(new ApiError({ status: 429, code: 'rate_limited', message: '' })).pause).toBe(false);
    expect(fallback(new ApiError({ status: 503, code: 'noora_busy', message: '' })).pause).toBe(false);
    expect(fallback(new ApiError({ status: 0, code: 'network', message: '' })).pause).toBe(false);
    expect(fallback(new Error('cut off')).notice).toMatch(/from my script/);
  });
});

describe('historyOf', () => {
  it('sends the newest messages with words in them', () => {
    const messages: Message[] = Array.from({ length: 10 }, (_, i) =>
      i % 2 ? { id: i, from: 'noora', at: 0, mood: 'neutral', text: `answer ${i}`, refs: [] } : { id: i, from: 'me', at: 0, text: i === 8 ? '' : `question ${i}`, attachments: [] },
    );
    const history = historyOf(messages);
    expect(history).toHaveLength(8);
    expect(history[0]).toEqual({ role: 'noora', text: 'answer 1' });
    expect(history.at(-1)).toEqual({ role: 'noora', text: 'answer 9' });
    expect(history.some((t) => t.text === '')).toBe(false);
  });
});
