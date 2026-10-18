import { describe, expect, it, vi } from 'vitest';
import type { Middleware } from 'openapi-fetch';
import { SIGNED_OUT_REASON, createSessionGuard, stepUpPurpose, type SessionGuardHooks } from './sessionGuard';

const API = 'http://127.0.0.1:8000';
type Params = Parameters<NonNullable<Middleware['onResponse']>>[0];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const refusal = (status: number, code: string) => json(status, { error: { code, message: 'x' } });

function setup(over: Partial<SessionGuardHooks> = {}) {
  const sent: Request[] = [];
  const hooks: SessionGuardHooks = {
    currentUserId: () => 'u1',
    sessionEnded: vi.fn(),
    signIn: vi.fn(async () => 'u1'),
    stepUp: vi.fn(async () => true),
    csrfToken: () => 'fresh-token',
    send: vi.fn(async (r: Request) => {
      sent.push(r);
      return json(200, { ok: true });
    }),
    ...over,
  };
  const guard = createSessionGuard(hooks);
  /** Run one request through the guard: onRequest, then onResponse with `answer`. */
  const run = async (method: string, path: string, answer: Response, body?: unknown) => {
    const request = new Request(`${API}${path}`, {
      method,
      headers: { 'X-CSRF-Token': 'old-token', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    await guard.onRequest?.({ request } as unknown as Parameters<NonNullable<Middleware['onRequest']>>[0]);
    return guard.onResponse?.({ request, response: answer } as unknown as Params);
  };
  return { hooks, run, sent };
}

describe('session guard: 401 (UX-1)', () => {
  it('signs the same person in again and sends the action again, body and fresh token included', async () => {
    const { hooks, run, sent } = setup();
    const result = await run('POST', '/api/v1/forum/threads/t1/replies', refusal(401, 'unauthenticated'), {
      body: 'My answer',
    });

    expect(hooks.sessionEnded).toHaveBeenCalledWith({ userId: 'u1', write: true });
    expect(hooks.signIn).toHaveBeenCalledWith(SIGNED_OUT_REASON);
    expect(result?.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].headers.get('X-CSRF-Token')).toBe('fresh-token');
    expect(await sent[0].json()).toEqual({ body: 'My answer' });
  });

  it('keeps the 401 when the person gives up', async () => {
    const { run, sent } = setup({ signIn: vi.fn(async () => null) });
    expect(await run('POST', '/api/v1/forum/threads', refusal(401, 'unauthenticated'), { title: 'x' })).toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('never does the previous person’s action in someone else’s name', async () => {
    const { run, sent } = setup({ signIn: vi.fn(async () => 'someone-else') });
    expect(await run('DELETE', '/api/v1/forum/threads/t1', refusal(401, 'unauthenticated'))).toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('lets a guest carry on after signing in', async () => {
    const { hooks, run, sent } = setup({ currentUserId: () => null, signIn: vi.fn(async () => 'u9') });
    const result = await run('PUT', '/api/v1/forum/threads/t1/vote', refusal(401, 'unauthenticated'), { value: 1 });
    expect(hooks.sessionEnded).not.toHaveBeenCalled();
    expect(result?.status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('only shows a guest after a read: nothing to send again', async () => {
    const { hooks, run } = setup();
    expect(await run('GET', '/api/v1/notifications', refusal(401, 'unauthenticated'))).toBeUndefined();
    expect(hooks.sessionEnded).toHaveBeenCalledWith({ userId: 'u1', write: false });
    expect(hooks.signIn).not.toHaveBeenCalled();
  });

  it('opens one dialog for every action waiting on it', async () => {
    let finish: (who: string | null) => void = () => undefined;
    const signIn = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
    const { run, sent } = setup({ signIn });
    const a = run('POST', '/api/v1/reports', refusal(401, 'unauthenticated'), { a: 1 });
    const b = run('PUT', '/api/v1/library/items/i1/star', refusal(401, 'unauthenticated'), { b: 2 });
    await new Promise((r) => setTimeout(r, 0));
    finish('u1');
    const [ra, rb] = await Promise.all([a, b]);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect([ra?.status, rb?.status]).toEqual([200, 200]);
    expect(sent).toHaveLength(2);
  });

  it('leaves sign-in and step-up requests alone', async () => {
    const { hooks, run } = setup();
    expect(
      await run('POST', '/api/v1/auth/otp/verify', refusal(401, 'unauthenticated'), { code: '1' }),
    ).toBeUndefined();
    expect(
      await run('POST', '/api/v1/me/step-up/verify', refusal(401, 'unauthenticated'), { code: '1' }),
    ).toBeUndefined();
    expect(hooks.sessionEnded).not.toHaveBeenCalled();
    expect(hooks.signIn).not.toHaveBeenCalled();
  });
});

describe('session guard: step-up (D2)', () => {
  it('asks for a code, then sends the change again', async () => {
    const { hooks, run, sent } = setup();
    const result = await run('POST', '/api/v1/me/identifiers/otp', refusal(403, 'step_up_required'), {
      identifier: '+97333000000',
    });
    expect(hooks.stepUp).toHaveBeenCalledWith('change how you sign in');
    expect(result?.status).toBe(200);
    expect(await sent[0].json()).toEqual({ identifier: '+97333000000' });
    expect(sent[0].headers.get('X-CSRF-Token')).toBe('fresh-token');
  });

  it('asks an admin for a code before a role change, then sends the change again (AD-1)', async () => {
    const { hooks, run, sent } = setup();
    const result = await run('PATCH', '/api/v1/admin/roles/r1', refusal(403, 'step_up_required'), {
      version: 4,
      name: 'Newsletter team',
    });
    expect(hooks.stepUp).toHaveBeenCalledWith('change roles');
    expect(result?.status).toBe(200);
    expect(sent[0].method).toBe('PATCH');
    expect(await sent[0].json()).toEqual({ version: 4, name: 'Newsletter team' });
  });

  it('keeps the refusal when the person gives up', async () => {
    const { run, sent } = setup({ stepUp: vi.fn(async () => false) });
    expect(await run('DELETE', '/api/v1/me', refusal(403, 'step_up_required'))).toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('ignores other refusals', async () => {
    const { hooks, run } = setup();
    expect(await run('DELETE', '/api/v1/forum/threads/t1', refusal(403, 'forbidden'))).toBeUndefined();
    expect(await run('POST', '/api/v1/forum/threads', refusal(403, 'csrf_failed'), {})).toBeUndefined();
    expect(hooks.stepUp).not.toHaveBeenCalled();
  });

  it('says what the code is for', () => {
    expect(stepUpPurpose({ method: 'DELETE', url: `${API}/api/v1/me` })).toBe('delete your account');
    expect(stepUpPurpose({ method: 'DELETE', url: `${API}/api/v1/me/identifiers/phone` })).toBe(
      'remove your phone number',
    );
    expect(stepUpPurpose({ method: 'DELETE', url: `${API}/api/v1/me/identifiers/email` })).toBe(
      'remove your email address',
    );
    expect(stepUpPurpose({ method: 'POST', url: `${API}/api/v1/me/identifiers/otp` })).toBe('change how you sign in');
    expect(stepUpPurpose({ method: 'POST', url: `${API}/api/v1/admin/roles` })).toBe('change roles');
    expect(stepUpPurpose({ method: 'PATCH', url: `${API}/api/v1/admin/roles/r1` })).toBe('change roles');
    expect(stepUpPurpose({ method: 'DELETE', url: `${API}/api/v1/admin/roles/r1` })).toBe('change roles');
    expect(stepUpPurpose({ method: 'PUT', url: `${API}/api/v1/admin/users/u1/roles` })).toBe('change someone’s roles');
    expect(stepUpPurpose({ method: 'PUT', url: `${API}/api/v1/admin/features/calendar` })).toBe('switch a feature');
    expect(stepUpPurpose({ method: 'PUT', url: `${API}/api/v1/mini-noora/settings` })).toBe(
      'change Mini Noora’s words',
    );
  });
});
