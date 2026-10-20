import { describe, expect, it } from 'vitest';
import { shieldStrayTaps, TAP_SHIELD_MS, type ShieldElement, type ShieldHost } from './tapShield';

type Handler = Parameters<ShieldElement['addEventListener']>[1];

function fakeHost(coarse: boolean) {
  const appended: ShieldElement[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const handlers = new Map<string, Handler>();
  let removed = false;
  const el: ShieldElement = {
    className: '',
    setAttribute: () => undefined,
    addEventListener: (type, fn) => handlers.set(type, fn),
    remove: () => {
      removed = true;
    },
  };
  const host: ShieldHost = {
    createElement: () => el,
    body: { appendChild: (e) => appended.push(e) },
    coarse: () => coarse,
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
  };
  return { host, appended, timers, handlers, isRemoved: () => removed };
}

describe('shieldStrayTaps', () => {
  it('does nothing with a mouse', () => {
    const f = fakeHost(false);
    expect(shieldStrayTaps(f.host)).toBeNull();
    expect(f.appended).toHaveLength(0);
  });

  it('covers the page on a touch screen, then goes', () => {
    const f = fakeHost(true);
    const el = shieldStrayTaps(f.host);
    expect(el?.className).toBe('ui-tap-shield');
    expect(f.appended).toHaveLength(1);
    expect(f.timers[0]?.ms).toBe(TAP_SHIELD_MS);
    expect(f.isRemoved()).toBe(false);
    f.timers[0]?.fn();
    expect(f.isRemoved()).toBe(true);
  });

  it('swallows the second tap', () => {
    const f = fakeHost(true);
    shieldStrayTaps(f.host);
    let prevented = 0;
    let stopped = 0;
    const e = { preventDefault: () => prevented++, stopPropagation: () => stopped++ };
    f.handlers.get('click')?.(e);
    f.handlers.get('pointerdown')?.(e);
    expect(prevented).toBe(2);
    expect(stopped).toBe(2);
  });
});
