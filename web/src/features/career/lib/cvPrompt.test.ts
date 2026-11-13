import { describe, expect, it } from 'vitest';
import { CV_PROMPT } from './cvPrompt';

describe('the message for an AI chat', () => {
  it('asks for the CV the student has, and the job they want, before anything else', () => {
    expect(CV_PROMPT).toContain('Do I already have a CV? If I do, ask me to paste it here');
    expect(CV_PROMPT).toContain('What kind of job or internship am I aiming for?');
    expect(CV_PROMPT).toContain('Never invent anything');
  });

  it('asks for the rules the rater checks, and leaves contact details to the student', () => {
    for (const rule of ['action verb', 'with a number', 'No "I"', 'date of birth', 'one way throughout', '[Phone]'])
      expect(CV_PROMPT).toContain(rule);
  });
});
