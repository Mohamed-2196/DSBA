import { describe, expect, it } from 'vitest';
import { askSeniorLink, topicLine } from './seniors';

describe('seniors', () => {
  it('names the topics in the order given', () => {
    expect(topicLine(['msc', 'internships'])).toBe('MSc applications, Internships');
  });
  it('asks a senior through the composer', () => {
    expect(askSeniorLink('a b')).toBe('/forum/new?senior=a%20b');
  });
});
