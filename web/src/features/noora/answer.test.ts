import { describe, expect, it } from 'vitest';
import type { ModuleSummary } from '../../api/types';
import { replyFromAnswer, visibleText } from './answer';

const st2133 = { id: 'st2133', unitCode: 'ST2133', name: 'Distribution theory', shortName: 'Distribution theory', year: 2 } as ModuleSummary;

describe('replyFromAnswer', () => {
  it('turns Hub links into cards and keeps their words in the answer', () => {
    const reply = replyFromAnswer('The MGF is in [chapter 1](/modules/st2133?tab=lessons&chapter=1&video=0). Dates are on [the calendar](/calendar).', [st2133]);
    expect(reply.text).toBe('The MGF is in chapter 1. Dates are on the calendar.');
    expect(reply.refs).toEqual([
      { code: 'ST2133', label: 'chapter 1', to: '/modules/st2133?tab=lessons&chapter=1&video=0' },
      { code: 'Calendar', label: 'the calendar', to: '/calendar' },
    ]);
    expect(reply.mood).toBe('happy');
  });

  it('never makes a card for another site, and lists a place once', () => {
    const reply = replyFromAnswer('See [this](https://example.com), [that](//evil.example.com), [forum](/forum) and [forum again](/forum).', []);
    expect(reply.text).toBe('See this, that, forum and forum again.');
    expect(reply.refs).toEqual([{ code: 'Hub', label: 'forum', to: '/forum' }]);
  });

  it('is neutral without links', () => {
    expect(replyFromAnswer('I’m not sure.', [])).toEqual({ mood: 'neutral', text: 'I’m not sure.', refs: [] });
  });
});

describe('visibleText', () => {
  it('shows links as words and hides one that is still being written', () => {
    expect(visibleText('See [the calendar](/calendar) and [the les')).toBe('See the calendar and ');
    expect(visibleText('See [the lessons](/modules/st')).toBe('See ');
    expect(visibleText('Plain text')).toBe('Plain text');
  });
});
