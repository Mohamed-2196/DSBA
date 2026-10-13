import { describe, expect, it } from 'vitest';
import { checkUpload, uploadContentType } from '../../../api/uploads';
import { uploadName } from './uploads';

const picture = (name: string, type: string) => ({ name, type });

describe('uploadName', () => {
  it('keeps a name that already says what the picture is', () => {
    expect(uploadName(picture('working.png', 'image/png'))).toBe('working.png');
    expect(uploadName(picture('IMG_2041.JPG', 'image/jpeg'))).toBe('IMG_2041.JPG');
    expect(uploadName(picture('board.jpeg', 'image/jpeg'))).toBe('board.jpeg');
    expect(uploadName(picture('meme.gif', 'image/gif'))).toBe('meme.gif');
  });

  it('names a pasted picture after its type', () => {
    expect(uploadName(picture('image', 'image/png'))).toBe('image.png');
    expect(uploadName(picture('', 'image/png'))).toBe('image.png');
    expect(uploadName(picture('   ', 'image/webp'))).toBe('image.webp');
  });

  it('gives a picture the extension of what it really is', () => {
    expect(uploadName(picture('photo.png', 'image/jpeg'))).toBe('photo.jpg');
    expect(uploadName(picture('Screenshot 10.15.32', 'image/png'))).toBe('Screenshot 10.15.png');
  });

  it('trusts the name when the browser gives no type', () => {
    expect(uploadName(picture('scan.webp', ''))).toBe('scan.webp');
  });

  it('leaves a file the forum doesn’t take as it is, so the check refuses it', () => {
    const heic = picture('IMG_1.HEIC', 'image/heic');
    expect(uploadName(heic)).toBe('IMG_1.HEIC');
    expect(uploadContentType('forum_image', uploadName(heic))).toBeNull();
    expect(checkUpload('forum_image', { name: heic.name, size: 1024 }, uploadName(heic))).toMatch(/^That file type can’t be attached\./);
    expect(uploadName(picture('notes.pdf', 'application/pdf'))).toBe('notes.pdf');
  });
});
