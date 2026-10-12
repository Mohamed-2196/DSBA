import { afterEach, describe, expect, it, vi } from 'vitest';
import { appUrl, copyText, hostOf } from './share';

describe('hostOf', () => {
  it('names the site a link opens, without www', () => {
    expect(hostOf('https://www.careers.stc.com.bh/jobs?x=1')).toBe('careers.stc.com.bh');
    expect(hostOf('http://bibf.com')).toBe('bibf.com');
    expect(hostOf('HTTPS://Example.COM/a')).toBe('example.com');
  });

  it.each(['mailto:rep@example.com', '/forum/new', 'javascript:alert(1)', 'not a url', '', null, undefined])('is empty for %s', (raw) => {
    expect(hostOf(raw)).toBe('');
  });
});

describe('appUrl', () => {
  it('makes an absolute link to a page of the Hub', () => {
    expect(appUrl('/newsletter/launch-edition', 'https://hub.example')).toBe('https://hub.example/newsletter/launch-edition');
    expect(appUrl('calendar?event=2026-10-23-st2134-exam', 'https://hub.example')).toBe('https://hub.example/calendar?event=2026-10-23-st2134-exam');
    expect(appUrl('/newsletter/x?section=deadlines#top', 'http://127.0.0.1:5177')).toBe('http://127.0.0.1:5177/newsletter/x?section=deadlines#top');
  });
});

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the Clipboard API when it is there', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyText('https://hub.example/x')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://hub.example/x');
  });

  it('falls back to a hidden text area when the Clipboard API refuses', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
    const area = { value: '', style: {} as Record<string, string>, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
    const execCommand = vi.fn(() => true);
    vi.stubGlobal('document', { createElement: () => area, body: { appendChild: vi.fn() }, execCommand });
    await expect(copyText('hello')).resolves.toBe(true);
    expect(area.value).toBe('hello');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(area.remove).toHaveBeenCalled();
  });

  it('says so when nothing works, without throwing', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('no DOM');
      },
    });
    await expect(copyText('hello')).resolves.toBe(false);
  });
});
