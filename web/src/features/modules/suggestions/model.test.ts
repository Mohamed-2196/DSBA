import { describe, expect, it } from 'vitest';
import { NEW_CHAPTER, acceptBody } from './model';

describe('acceptBody', () => {
  it('sends the chapter picked, and the title only when it changed', () => {
    expect(acceptBody('abc12345', '', 'Gradient descent', 'Gradient descent')).toEqual({
      body: { chapterId: 'abc12345' },
    });
    expect(acceptBody('abc12345', '', '  Better title ', 'Gradient descent')).toEqual({
      body: { chapterId: 'abc12345', title: 'Better title' },
    });
  });

  it('names a new chapter, or asks for its name', () => {
    expect(acceptBody(NEW_CHAPTER, ' Chapter 1: Returns ', '', 'X')).toEqual({
      body: { newChapter: 'Chapter 1: Returns' },
    });
    expect(acceptBody(NEW_CHAPTER, '  ', 'X', 'X')).toEqual({ error: 'newChapter' });
  });

  it('asks for a chapter when none is picked', () => {
    expect(acceptBody('', '', 'X', 'X')).toEqual({ error: 'chapterId' });
  });
});
