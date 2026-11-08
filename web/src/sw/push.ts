// What the service worker does with a push (sw.ts): read the message the API sent (app/services/push.py, payload),
// and pick the tab a tap on the notification opens. Kept apart from sw.ts so it can be tested.

export interface PushMessage {
  title: string;
  body: string | null;
  /** a page of the Hub, '/forum/<slug>#reply-<id>' */
  url: string;
  /** a later push with the same tag replaces this one on the device */
  tag: string;
  /** the unread notifications, for the app's icon; null when not sent */
  badge: number | null;
}

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/** A Hub page only: '/x', never '//host', '/\host' or anything with a scheme. */
export function hubPath(v: unknown): string {
  return typeof v === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(v) ? v : '/';
}

/** The message in a push's data, or null for anything that isn't one of the Hub's. */
export function parsePush(data: string | null | undefined): PushMessage | null {
  if (!data) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const title = text(m.title, 200);
  if (!title) return null;
  const badge = typeof m.badge === 'number' && Number.isInteger(m.badge) && m.badge >= 0 ? m.badge : null;
  return {
    title,
    body: text(m.body, 400),
    url: hubPath(m.url),
    tag: text(m.tag, 100) ?? 'hub',
    badge,
  };
}

export interface WindowLike {
  url: string;
}

/**
 * Which open window of the Hub a tap opens `path` in: one showing that page already (focused only), else any
 * window of the Hub (it goes there), else null (a new window).
 */
export function pickWindow<T extends WindowLike>(
  windows: readonly T[],
  path: string,
  origin: string,
): { window: T; navigate: boolean } | null {
  const target = new URL(path, origin).href;
  const ours = windows.filter((w) => {
    try {
      return new URL(w.url).origin === origin;
    } catch {
      return false;
    }
  });
  const same = ours.find((w) => w.url === target);
  if (same) return { window: same, navigate: false };
  const any = ours[0];
  return any ? { window: any, navigate: true } : null;
}
