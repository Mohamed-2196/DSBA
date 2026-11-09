import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../api/types';
import type { PushSupport } from '../../lib/push';
import { InstallSteps } from '../../shell/InstallSteps';
import type * as Ui from '../../ui';
import { DevicePush } from './DevicePush';

const browser = vi.hoisted(() => ({
  support: 'yes' as PushSupport,
  permission: 'default' as NotificationPermission,
}));

vi.mock('../../lib/push', () => ({
  PushRefused: class PushRefused extends Error {},
  browserPushSupport: () => browser.support,
  pushPermission: () => browser.permission,
  devicePushOn: () => Promise.resolve(false),
  turnPushOn: vi.fn(),
  turnPushOff: vi.fn(),
}));
vi.mock('../../auth', () => ({
  useAuth: () => ({ featureOn: () => true }),
  useUpdatePreferences: () => ({ mutate: vi.fn() }),
}));
vi.mock('../../state', () => ({ useToast: () => ({ push: vi.fn() }) }));
// The dialog's body, without the portal the server renderer can't draw.
vi.mock('../../ui', async (actual) => ({
  ...(await actual<typeof Ui>()),
  Modal: ({ description, children }: { description: ReactNode; children: ReactNode }) =>
    createElement('div', null, createElement('p', null, description), children),
}));

const me = { id: 'u1', preferences: { pushReplies: true } } as unknown as Me;

const render = () => renderToStaticMarkup(createElement(DevicePush, { me }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const steps = (html: string) => [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
/** The device switch's <input>. */
const deviceInput = (html: string) => /<input[^>]*data-hub="account-push-device"[^>]*>/.exec(html)?.[0] ?? '';

beforeEach(() => {
  browser.support = 'yes';
  browser.permission = 'default';
});

describe('Notifications on your devices', () => {
  it('says once that they show when the Hub is closed, and names this device’s switch plainly', () => {
    const t = text(render());
    expect(t).toContain(
      'They show on your phone or computer even when the Hub is closed. Turn them on for each device.',
    );
    expect(t).toContain('On this device');
    expect(t).toContain('Only this browser. Turn it on again on your other devices.');
    expect(t.match(/even when the Hub is closed/g)).toHaveLength(1);
    expect(t).not.toContain('Off until you turn it on here');
    expect(t).not.toContain('What comes to every device');
  });

  it('puts this device in a panel of its own, then a heading over the kinds in a second panel', () => {
    const html = render();
    const heading = html.indexOf('<h3 class="acct-push__title">Which ones come to your devices</h3>');
    expect(heading).toBeGreaterThan(html.indexOf('data-hub="account-push-device"'));
    expect(heading).toBeLessThan(html.indexOf('Replies to you'));
    expect(text(html)).toContain('To every device where you’ve turned them on.');
    expect(html.match(/class="ui-panel/g)).toHaveLength(2);
    expect(html).not.toContain('acct-push__heading');
  });

  it('turns the switch off limits, with a note, while the browser blocks notifications', () => {
    browser.permission = 'denied';
    const html = render();
    expect(deviceInput(html)).toContain('disabled');
    expect(text(html)).toContain('Notifications are blocked for the Hub in this browser.');
  });

  it('leaves the switch to tap while the browser hasn’t blocked them', () => {
    const html = render();
    expect(deviceInput(html)).not.toContain('disabled');
    expect(text(html)).not.toContain('Notifications are blocked');
  });

  it('shows an iPhone the Install dialog’s own steps, then how to turn them on', () => {
    browser.support = 'home-screen';
    const html = render();
    expect(deviceInput(html)).toBe('');
    const dialog = renderToStaticMarkup(
      createElement(InstallSteps, {
        offer: { way: 'iphone', stepsOpen: true, start: () => undefined, closeSteps: () => undefined },
      }),
    );
    expect(steps(dialog)).toEqual([
      'Open the Hub in Safari.',
      'Tap Share at the bottom of the screen.',
      'Tap Add to Home Screen, then Add.',
    ]);
    expect(steps(html)).toEqual([
      ...steps(dialog),
      'Open the Hub from your Home Screen, come back here and turn it on.',
    ]);
    expect(text(dialog)).toContain('The Hub then opens from your Home Screen like any other app.');
    expect(text(html)).not.toMatch(/home screen/);
  });
});
