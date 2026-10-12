import { describe, expect, it } from 'vitest';
import { altFromFileName, bold, bulletList, code, imageMarkdown, insertBlock, italic, link, numberedList, quote, removeImageLines } from './editing';

const MEDIA = '/api/v1/media/7511c4f7-ffbf-4f8e-8500-93334507e674';

describe('toolbar edits', () => {
  it('wraps the selection, and selects what it wrapped', () => {
    expect(bold('a mgf b', 2, 5)).toEqual({ text: 'a **mgf** b', sel: [4, 7] });
    expect(italic('a mgf b', 2, 5)).toEqual({ text: 'a *mgf* b', sel: [3, 6] });
  });

  it('puts a placeholder in when nothing is selected', () => {
    expect(bold('', 0, 0)).toEqual({ text: '**bold text**', sel: [2, 11] });
  });

  it('takes the wrapping off again', () => {
    expect(bold('a **mgf** b', 4, 7)).toEqual({ text: 'a mgf b', sel: [2, 5] });
  });

  it('formats code inline, or as a block over several lines', () => {
    expect(code('x', 0, 1).text).toBe('`x`');
    expect(code('a\nb', 0, 3).text).toBe('```\na\nb\n```\n');
  });

  it('turns lines into lists and quotes', () => {
    expect(bulletList('one\ntwo', 0, 7).text).toBe('- one\n- two');
    expect(numberedList('one\ntwo', 0, 7).text).toBe('1. one\n2. two');
    expect(quote('said', 2, 2).text).toBe('> said');
  });

  it('makes a link of the selection and selects the address to type', () => {
    const edit = link('see notes', 4, 9);
    expect(edit.text).toBe('see [notes](https://)');
    expect(edit.text.slice(...edit.sel)).toBe('https://');
  });
});

describe('pictures in the text', () => {
  const line = `![working](${MEDIA})`;

  it('goes on lines of its own after the line the cursor is on', () => {
    expect(insertBlock('', 0, line)).toEqual({ text: `${line}\n`, sel: [line.length + 1, line.length + 1] });
    expect(insertBlock('hello world\nnext', 3, line).text).toBe(`hello world\n\n${line}\n\nnext`);
    expect(insertBlock('text', 4, line).text).toBe(`text\n\n${line}\n`);
  });

  it('comes out again with its line, and nothing else', () => {
    expect(removeImageLines(`a\n\n${line}\n\nb`, MEDIA)).toBe('a\n\nb');
    expect(removeImageLines(`see ${line} inline`, MEDIA)).toBe(`see ${line} inline`);
  });

  it('has a description that cannot break out of its brackets', () => {
    expect(imageMarkdown('a ](javascript:x) [b', MEDIA)).toBe(`![a javascript:x b](${MEDIA})`);
    expect(imageMarkdown('  ', MEDIA)).toBe(`![Image](${MEDIA})`);
  });

  it('starts the description from the file name', () => {
    expect(altFromFileName('Week_3-notes.final.PNG')).toBe('Week 3 notes final');
    expect(altFromFileName('.png')).toBe('Image');
  });
});
