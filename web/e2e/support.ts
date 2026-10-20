// Shared helpers for the end-to-end suite: settings from the environment, emails from the dev mail folder, dev-login
// for the rep and the admin, the run's personas, CSRF headers and small test files.
//
// The defaults fit the Docker stack in e2e mode: `scripts/e2e.sh` switches the API to its file mail backend
// (compose.e2e.yaml) and runs the suite. It writes to api/var/mail, in Docker (where it is mounted) and without it
// (DSBA_EMAIL_BACKEND=file, run from api/).
//
// Settings (all optional):
//   E2E_BASE_URL   the web app, which proxies /api to the API (default http://localhost:5173, the web container)
//   E2E_MAIL_DIR   where emails are saved as .eml files (default api/var/mail)
//   E2E_API_DIR    the folder dev-login runs in (default api/)
//   E2E_DEV_LOGIN  the dev-login command (default "docker compose -p dsba-hub exec -T api python -m app.cli
//                  dev-login"; without Docker, "uv run --no-sync python -m app.cli dev-login")
//   E2E_PSQL       runs one SQL statement, given as its last argument (default "docker compose -p dsba-hub exec -T db
//                  psql -U dsba -d dsba -At -v ON_ERROR_STOP=1 -c"); the step-up test ages a session with it, and
//                  the setup confirms Ali's address with it (as if he had continued with Google once)
//   E2E_STATE_DIR  where sessions and the run's details are kept between projects (default: a temp folder)
//   E2E_KEEP=1     keep what the run created (no account deletion, no clean-up at the end)
// The first cloud set-up ran with E2E_BASE_URL=http://127.0.0.1:5178, E2E_MAIL_DIR=/home/claude/devsvc/mail and
// E2E_DEV_LOGIN="uv run --no-sync python -m app.cli dev-login".
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import type { components } from '../src/api/schema';
import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiFolder = path.resolve(here, '..', '..', 'api');
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export const env = {
  baseURL,
  host: new URL(baseURL).hostname,
  mailDir: process.env.E2E_MAIL_DIR ?? path.join(apiFolder, 'var', 'mail'),
  apiDir: process.env.E2E_API_DIR ?? apiFolder,
  devLogin: process.env.E2E_DEV_LOGIN ?? 'docker compose -p dsba-hub exec -T api python -m app.cli dev-login',
  psql: process.env.E2E_PSQL ?? 'docker compose -p dsba-hub exec -T db psql -U dsba -d dsba -At -v ON_ERROR_STOP=1 -c',
  stateDir: process.env.E2E_STATE_DIR ?? path.join(os.tmpdir(), `dsba-e2e-${new URL(baseURL).port || 'default'}`),
  keep: process.env.E2E_KEEP === '1',
};
fs.mkdirSync(env.stateDir, { recursive: true });

// ── the run: who signed up, and where their sessions are ──────────────────────────────────────

export type Persona = 'sara' | 'ali' | 'rep' | 'admin';

export interface RunInfo {
  /** a short tag in everything this run creates, so it can be found (and cleaned up) again */
  tag: string;
  sara: { name: string; email: string; password: string };
  ali: { name: string; email: string; password: string };
  rep: { name: string; email: string };
  admin: { name: string; email: string };
  /** filled in as the run goes, for the clean-up */
  created: { threads: string[]; items: string[]; events: string[]; issues: string[] };
}

const runFile = path.join(env.stateDir, 'run.json');
export const statePath = (who: Persona): string => path.join(env.stateDir, `${who}.json`);

/** A password for this run: long enough, and no common one. */
export function newPassword(tag: string): string {
  return `e2e ${tag} quiet library lamp`;
}

/** A new run: new students (email addresses nobody uses, with passwords), the same rep and admin. */
export function newRun(): RunInfo {
  const tag = `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
  const run: RunInfo = {
    tag,
    sara: { name: 'Sara E2E', email: `sara.e2e.${tag}@example.com`, password: newPassword(tag) },
    ali: { name: 'Ali E2E', email: `ali.e2e.${tag}@example.com`, password: newPassword(`${tag}a`) },
    rep: { name: 'Fatima E2E', email: 'e2e.rep@example.com' },
    admin: { name: 'Maryam E2E', email: 'e2e.admin@example.com' },
    created: { threads: [], items: [], events: [], issues: [] },
  };
  saveRun(run);
  return run;
}

export function readRun(): RunInfo {
  if (!fs.existsSync(runFile)) throw new Error(`No run found in ${env.stateDir}: run the setup project first.`);
  return JSON.parse(fs.readFileSync(runFile, 'utf8')) as RunInfo;
}

export function saveRun(run: RunInfo): void {
  fs.writeFileSync(runFile, JSON.stringify(run, null, 2));
}

/** Remembers something this run created (by id or slug), for the clean-up at the end. */
export function remember(kind: keyof RunInfo['created'], id: string): void {
  const run = readRun();
  if (!run.created[kind].includes(id)) run.created[kind].push(id);
  saveRun(run);
}

// ── emails ───────────────────────────────────────────────────────────────────────────────

/** Whether an email with this subject went to `to` since `since` (the mail worker sends them). */
export function mailedSince(to: string, subject: string, since: number): boolean {
  if (!fs.existsSync(env.mailDir)) return false;
  return fs
    .readdirSync(env.mailDir)
    .filter((f) => f.endsWith('.eml') && fs.statSync(path.join(env.mailDir, f)).mtimeMs >= since - 2000)
    .some((f) => {
      const head = fs.readFileSync(path.join(env.mailDir, f), 'utf8').split(/\r?\n\r?\n/)[0];
      return (
        new RegExp(`^To:.*${to.replace(/[.+]/g, '\\$&')}`, 'im').test(head) && head.includes(`Subject: ${subject}`)
      );
    });
}

// ── sessions ────────────────────────────────────────────────────────────────────────────────

const run$ = promisify(execFile);

/** A session token for a rep or an admin (development only: python -m app.cli dev-login). */
export async function devLogin(
  email: string,
  opts: { name: string; year: number; role: 'rep' | 'admin' },
): Promise<string> {
  const [cmd, ...args] = env.devLogin.split(/\s+/);
  const { stdout } = await run$(
    cmd,
    [...args, email, '--name', opts.name, '--year', String(opts.year), '--role', opts.role],
    {
      cwd: env.apiDir,
      timeout: 60_000,
    },
  );
  const token = stdout.trim().split('\n').pop()?.trim() ?? '';
  if (!/^[\w-]{20,}$/.test(token)) throw new Error(`dev-login printed no token: ${stdout.slice(0, 200)}`);
  return token;
}

/** Makes a user's live sessions `minutes` older in the database. Deleting the account, adding a password or linking
 * Google needs a session under 10 minutes old (decision D2), so an aged session meets the step-up dialog, as a
 * student does who signed in yesterday. */
export async function ageSessions(userId: string, minutes: number): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(userId) || !Number.isInteger(minutes))
    throw new Error(`ageSessions: bad input ${userId}, ${minutes}`);
  const [cmd, ...args] = env.psql.split(/\s+/);
  const sql = `UPDATE user_sessions SET created_at = created_at - interval '${minutes} minutes' WHERE user_id = '${userId}' AND revoked_at IS NULL`;
  const { stdout } = await run$(cmd, [...args, sql], { cwd: env.apiDir, timeout: 60_000 });
  if (!/^UPDATE [1-9]/m.test(stdout)) throw new Error(`ageSessions changed no session: ${stdout.slice(0, 200)}`);
}

/** Marks an account's email address confirmed, as continuing with Google once does (the suite can't sign in to
 * Google). Staff roles need a confirmed address: the admin spec gives Ali one. */
export async function confirmEmail(email: string): Promise<void> {
  if (!/^[\w.+-]+@[\w.-]+$/.test(email)) throw new Error(`confirmEmail: bad input ${email}`);
  const [cmd, ...args] = env.psql.split(/\s+/);
  const sql = `UPDATE users SET email_confirmed_at = now() WHERE email = '${email.toLowerCase()}'`;
  const { stdout } = await run$(cmd, [...args, sql], { cwd: env.apiDir, timeout: 60_000 });
  if (!/^UPDATE 1/m.test(stdout)) throw new Error(`confirmEmail changed no account: ${stdout.slice(0, 200)}`);
}

/** Every page in the suite hides Mini Noora (she floats over the page and covers part of it) unless a test wants her,
 * and a guest starts on Year 2 unless the test chooses otherwise (no first-visit dialog). */
export async function prepareContext(
  ctx: BrowserContext,
  { noora = false, year = '2' }: { noora?: boolean; year?: string | null } = {},
): Promise<void> {
  await ctx.addInitScript(
    ([hide, y]) => {
      try {
        if (hide) window.localStorage.setItem('hub.noora.hidden', '1');
        if (y && !window.localStorage.getItem('selectedYear')) window.localStorage.setItem('selectedYear', y);
      } catch {
        /* storage unavailable */
      }
    },
    [!noora, year] as const,
  );
}

export async function personaContext(
  browser: Browser,
  who: Persona,
  opts: Parameters<typeof prepareContext>[1] & { mobile?: boolean } = {},
): Promise<BrowserContext> {
  // The saved state carries the setup's localStorage, Mini Noora hidden included: a test that wants her drops that.
  const state = JSON.parse(fs.readFileSync(statePath(who), 'utf8')) as Awaited<
    ReturnType<BrowserContext['storageState']>
  >;
  if (opts.noora)
    for (const o of state.origins) o.localStorage = o.localStorage.filter((item) => item.name !== 'hub.noora.hidden');
  const ctx = await browser.newContext({
    baseURL: env.baseURL,
    storageState: state,
    acceptDownloads: true,
    ...(opts.mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
  });
  await prepareContext(ctx, { year: null, ...opts }); // a signed-in student's year comes from the account
  return ctx;
}

/** Headers for a write from page.request (double-submit CSRF: the dsba_csrf cookie echoed in X-CSRF-Token). */
export async function csrf(ctx: BrowserContext, request: APIRequestContext): Promise<Record<string, string>> {
  let cookie = (await ctx.cookies()).find((c) => c.name === 'dsba_csrf')?.value;
  if (!cookie) {
    await request.get('/api/v1/auth/csrf');
    cookie = (await ctx.cookies()).find((c) => c.name === 'dsba_csrf')?.value;
  }
  return { 'X-CSRF-Token': cookie ?? '' };
}

/** A rep's or admin's dev-login session is renewed when it is past the step-up window (10 minutes, decision D2):
 * switching features, roles and suspensions need a fresh session, and the run's dev-login sessions are made in the
 * setup project, long before the later specs. api() renews by itself; a test that changes roles through the screens
 * renews first, or "Confirm it’s you" stops it. Students' sessions are never renewed (their step-up is tested). */
export async function renewStaffSession(ctx: BrowserContext): Promise<boolean> {
  const current = (await ctx.cookies()).find((c) => c.name === 'dsba_session')?.value;
  if (!current) return false;
  const run = readRun();
  for (const who of ['rep', 'admin'] as const) {
    const file = statePath(who);
    if (!fs.existsSync(file)) continue;
    const state = JSON.parse(fs.readFileSync(file, 'utf8')) as Awaited<ReturnType<BrowserContext['storageState']>>;
    const cookie = state.cookies.find((c) => c.name === 'dsba_session');
    if (cookie?.value !== current) continue;
    const token = await devLogin(run[who].email, { name: run[who].name, year: 3, role: who });
    // The CSRF token belongs to the old session: drop it, and csrf() asks for a new one.
    await ctx.clearCookies({ name: 'dsba_csrf' });
    await ctx.addCookies([{ name: 'dsba_session', value: token, domain: env.host, path: '/' }]);
    cookie.value = token;
    state.cookies = state.cookies.filter((c) => c.name !== 'dsba_csrf');
    fs.writeFileSync(file, JSON.stringify(state)); // contexts opened later start with the fresh session
    return true;
  }
  return false;
}

/** For a test that changes roles, switches or suspensions through the screens: renews the rep's or admin's session
 * when it is near the step-up window, so "Confirm it’s you" doesn't stop the test half way. */
export async function freshStaffSession(page: Page, who: 'rep' | 'admin'): Promise<void> {
  const age = Date.now() - fs.statSync(statePath(who)).mtimeMs;
  if (age > 8 * 60_000) await renewStaffSession(page.context());
}

export async function api<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  data?: unknown,
): Promise<{ status: number; body: T }> {
  const send = async () => {
    const headers = method === 'GET' ? {} : await csrf(page.context(), page.request);
    return page.request.fetch(url, { method, headers, data: data === undefined ? undefined : data });
  };
  let r = await send();
  if (
    r.status() === 403 &&
    (await r.text()).includes('"step_up_required"') &&
    (await renewStaffSession(page.context()))
  )
    r = await send();
  const text = await r.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: r.status(), body: body as T };
}

/** Removes a module the run added (content.edit): its lessons first, then its chapters (the editor keeps a chapter
 * that still has lessons), then the module. Nothing happens when it is already gone. */
export async function removeModule(admin: Page, id: string): Promise<void> {
  type Mod = { version: number; chapters: { lessons: unknown[] }[] };
  const m = await api<Mod>(admin, 'GET', `/api/v1/content/modules/${id}`);
  if (m.status !== 200) return;
  const noLessons = await api<Mod>(admin, 'PUT', `/api/v1/content/modules/${id}`, {
    ...m.body,
    chapters: m.body.chapters.map((c) => ({ ...c, lessons: [] })),
  });
  expect(noLessons.status, `empty the lessons of ${id}`).toBe(200);
  const empty = await api<Mod>(admin, 'PUT', `/api/v1/content/modules/${id}`, { ...noLessons.body, chapters: [] });
  expect(empty.status, `empty the chapters of ${id}`).toBe(200);
  expect(
    (await api(admin, 'DELETE', `/api/v1/content/modules/${id}?version=${empty.body.version}`)).status,
    `remove ${id}`,
  ).toBe(204);
}

/** The id of a role, by its slug (admins only). */
export async function roleIdBySlug(admin: Page, slug: string): Promise<string> {
  const r = await api<{ roles: { id: string; slug: string }[] }>(admin, 'GET', '/api/v1/admin/roles');
  const role = r.body.roles.find((x) => x.slug === slug);
  if (!role) throw new Error(`No role ${slug}`);
  return role.id;
}

/** A feature with a switch, as the API names them (GET /api/v1/admin/features lists them all). */
export type Feature = components['schemas']['FeaturesOut']['features'][number];
type SwitchMode = 'off' | 'roles' | 'everyone';

/** Sets a feature's switch (admins only). A spec that changes a switch writes it down first (switchOn) and puts it
 * back in afterAll (switchBack). */
export async function setSwitch(
  admin: Page,
  feature: Feature,
  mode: SwitchMode,
  roleIds: string[] = [],
): Promise<void> {
  const r = await api(admin, 'PUT', `/api/v1/admin/features/${feature}`, { mode, roleIds });
  if (r.status === 429) return switchAsSpare(feature, mode, roleIds);
  expect(r.status, `switch ${feature} ${mode}`).toBe(200);
}

interface SwitchState {
  feature: Feature;
  mode: SwitchMode;
  roleIds: string[];
}

async function switchStates(admin: Page): Promise<SwitchState[]> {
  const r = await api<SwitchState[]>(admin, 'GET', '/api/v1/admin/features');
  expect(r.status, 'read the switches').toBe(200);
  return r.body;
}

const sameSwitch = (a: SwitchState | undefined, b: SwitchState) =>
  a?.mode === b.mode && [...a.roleIds].sort().join() === [...b.roleIds].sort().join();

const savedSwitches = (key: string) => path.join(env.stateDir, `switches-${key}.json`);

/** For a spec's beforeAll: switches `features` on for everyone, after writing down how each one was (under `key`, in
 * the state folder, so a worker that restarts after a failure keeps the first record). The stack may be someone's
 * working copy, so switchBack puts each switch back as it was found, on or off. A switch already on isn't touched:
 * every change counts towards the admin's limit. */
export async function switchOn(browser: Browser, key: string, features: readonly Feature[]): Promise<void> {
  const ctx = await personaContext(browser, 'admin');
  try {
    const admin = await ctx.newPage();
    const now = await switchStates(admin);
    const file = savedSwitches(key);
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(now.filter((s) => features.includes(s.feature))));
    for (const feature of features)
      if (now.find((s) => s.feature === feature)?.mode !== 'everyone') await setSwitch(admin, feature, 'everyone');
  } finally {
    await ctx.close();
  }
}

/** For the spec's afterAll, and the teardown for a run that stopped half way: puts back each switch `switchOn` wrote
 * down under `key`, the last first. */
export async function switchBack(browser: Browser, key: string): Promise<void> {
  const file = savedSwitches(key);
  if (!fs.existsSync(file)) return;
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as SwitchState[];
  const ctx = await personaContext(browser, 'admin');
  try {
    const admin = await ctx.newPage();
    const now = await switchStates(admin);
    for (const s of [...saved].reverse())
      if (
        !sameSwitch(
          now.find((x) => x.feature === s.feature),
          s,
        )
      )
        await setSwitch(admin, s.feature, s.mode, s.roleIds);
    fs.rmSync(file);
  } finally {
    await ctx.close();
  }
}

/** The keys of the switches written down and not put back yet: a spec that stopped before its afterAll. */
export function switchesLeft(): string[] {
  return fs
    .readdirSync(env.stateDir)
    .filter((f) => /^switches-.+\.json$/.test(f))
    .map((f) => f.slice('switches-'.length, -'.json'.length));
}

/** An admin allows 60 changes to roles and switches in 10 minutes (services/roles.py), and the whole suite makes
 * more than that. When the run's admin reaches the limit, a spare admin (dev-login, a made-up address) makes the
 * change; the next spare takes over when that one reaches it too. */
async function switchAsSpare(feature: string, mode: string, roleIds: string[]): Promise<void> {
  const file = path.join(env.stateDir, 'spare-admin.json');
  let spare = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { n: number; token: string }) : null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!spare || attempt > 0) {
      const n = (spare?.n ?? 0) + 1;
      spare = {
        n,
        token: await devLogin(`spare${n}.e2e.admin@example.com`, {
          name: `Spare admin E2E ${n}`,
          year: 3,
          role: 'admin',
        }),
      };
      fs.writeFileSync(file, JSON.stringify(spare));
    }
    const ctx = await playwrightRequest.newContext({
      baseURL: env.baseURL,
      storageState: {
        cookies: [
          {
            name: 'dsba_session',
            value: spare.token,
            domain: env.host,
            path: '/',
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    try {
      await ctx.get('/api/v1/auth/csrf');
      const token = (await ctx.storageState()).cookies.find((c) => c.name === 'dsba_csrf')?.value ?? '';
      const r = await ctx.put(`/api/v1/admin/features/${feature}`, {
        headers: { 'X-CSRF-Token': token },
        data: { mode, roleIds },
      });
      if (r.status() === 200) return;
      // Spent (429) or too old for a change (403 step-up): the next spare.
      if (r.status() !== 429 && r.status() !== 403)
        expect(r.status(), `switch ${feature} ${mode} (spare admin): ${await r.text()}`).toBe(200);
    } finally {
      await ctx.dispose();
    }
  }
  throw new Error(`switch ${feature} ${mode}: no spare admin could make the change`);
}

/** Opens /account and waits for its heading. */
export async function gotoAccount(page: Page): Promise<void> {
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
}

// ── small, real test files (made at run time: nothing binary is kept in the repo) ─────────────

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip with stored (uncompressed) entries: enough for a real .docx. */
function zip(entries: [string, string][]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** A one-page PDF with a few lines of text. */
function pdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (m) => `\\${m}`);
  const stream = `BT /F1 12 Tf 50 780 Td 16 TL ${lines.map((l) => `(${esc(l)}) '`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A small PNG: a light page with a few dark bars, like a photo of some working. */
function png(width = 160, height = 90): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const ink = y % 18 > 12 && x > 10 && x < width - 10 - (y % 37);
      const v = ink ? 40 : 245;
      raw.fill(v, y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function docx(paragraphs: string[]): Buffer {
  const body = paragraphs
    .map(
      (p) => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`,
    )
    .join('');
  return zip([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ],
  ]);
}

export interface TestFiles {
  dir: string;
  pdf: string;
  /** two more PDFs, a paper and its examiners' report: the library shows one file per content */
  paper: string;
  report: string;
  docx: string;
  ipynb: string;
  csv: string;
  png: string;
  exe: string;
  fakePdf: string;
  tooBig: string;
}

/** Writes the run's upload files (real files, plus three wrong ones) and returns their paths. Each holds the run's
 * tag: the library lists one file per content, so a file left by an earlier run would hide this run's copy. */
export function makeFiles(tag: string): TestFiles {
  const dir = path.join(env.stateDir, `files-${tag}`);
  fs.mkdirSync(dir, { recursive: true });
  const p = (name: string) => path.join(dir, name);
  const files: TestFiles = {
    dir,
    pdf: p(`ST2133 MGF summary ${tag}.pdf`),
    paper: p(`EC1002 May 2024 paper ${tag}.pdf`),
    report: p(`EC1002 commentary ${tag}.pdf`),
    docx: p(`EC1002 elasticity notes ${tag}.docx`),
    ipynb: p(`ST2195 pandas practice ${tag}.ipynb`),
    csv: p(`ST2187 sales data ${tag}.csv`),
    png: p(`ST2133 working ${tag}.png`),
    exe: p('ST2133 solutions setup.exe'),
    fakePdf: p('ST2134 past paper 2024.pdf'),
    tooBig: p('ST2195 all lecture recordings.pdf'),
  };
  if (!fs.existsSync(files.pdf)) {
    fs.writeFileSync(
      files.pdf,
      pdf([
        `ST2133 moment generating functions (${tag})`,
        'M_X(t) = E[e^{tX}]',
        'Poisson: exp(lambda(e^t - 1))',
        'Normal: exp(mu t + sigma^2 t^2 / 2)',
      ]),
    );
    fs.writeFileSync(
      files.paper,
      pdf([`EC1002 Introduction to Economics, May 2024, Zone A (${tag})`, 'Answer FOUR questions.']),
    );
    fs.writeFileSync(
      files.report,
      pdf([`EC1002 examiners' commentary (${tag})`, 'Question 3: most candidates did well.']),
    );
    fs.writeFileSync(
      files.docx,
      docx([
        `EC1002 Price elasticity of demand (${tag})`,
        'PED = % change in quantity / % change in price.',
        'Use the midpoint formula and show it.',
      ]),
    );
    fs.writeFileSync(
      files.ipynb,
      JSON.stringify({
        cells: [
          { cell_type: 'markdown', metadata: {}, source: [`# ST2195 pandas practice (${tag})`] },
          {
            cell_type: 'code',
            execution_count: 1,
            metadata: {},
            outputs: [],
            source: ['import pandas as pd\n', "df = pd.read_csv('2005.csv')\n", 'df.head()'],
          },
        ],
        metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
        nbformat: 4,
        nbformat_minor: 5,
      }),
    );
    fs.writeFileSync(
      files.csv,
      ['advertising,price,sales', '120,4.5,210', '340,3.9,288', '510,5.2,301', '760,4.1,402'].join('\n') + '\n',
    );
    fs.writeFileSync(files.png, png());
    fs.writeFileSync(files.exe, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 1)]));
    fs.writeFileSync(
      files.fakePdf,
      '<!doctype html><html><body><h1>ST2134 2024</h1><script>document.title="x"</script></body></html>',
    );
    const fd = fs.openSync(files.tooBig, 'w');
    fs.writeSync(fd, '%PDF-1.4\n');
    fs.ftruncateSync(fd, 51 * 1024 * 1024); // sparse: 51 MB on paper, nothing on disk
    fs.closeSync(fd);
  }
  return files;
}

/** Console errors a page logged, without the ones every guest page has (GET /me answers 401 for guests). */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    const where = m.location().url ?? '';
    if (/status of 401/.test(t)) return; // a guest's GET /me
    if (/net::ERR_/.test(t)) return; // external thumbnails and players the test machine can't reach
    if (/status of 404/.test(t) && where.includes('/api/v1/media/')) return; // a removed picture (the post shows a note)
    errors.push(`${t} ${where}`.trim());
  });
  return errors;
}

/** A newsletter issue number no published issue has: the API refuses a number already out (ST-68). */
export const freshIssueNumber = (): number => 10_000 + Math.floor(Math.random() * 89_000);
