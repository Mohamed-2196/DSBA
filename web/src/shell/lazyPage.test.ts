import { describe, expect, it, vi } from 'vitest';
import { lazyPage } from './lazyPage';

const Page = () => null;

describe('lazyPage', () => {
  it('downloads the page once, however often it is preloaded', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Page }));
    const page = lazyPage(load);
    expect(load).not.toHaveBeenCalled();
    const first = page.preload();
    const second = page.preload();
    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ default: Page });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('tries again after a download fails', async () => {
    const load = vi
      .fn<() => Promise<{ default: typeof Page }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ default: Page });
    const page = lazyPage(load);
    await expect(page.preload()).rejects.toThrow('offline');
    await expect(page.preload()).resolves.toEqual({ default: Page });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
