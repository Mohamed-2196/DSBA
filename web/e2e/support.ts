// Shared helpers for the end-to-end suite: settings from the environment, one-time codes from the dev mail and
// SMS folders, dev-login for the rep and the admin, the run's personas, CSRF headers and small test files.
//
// Settings (all optional):
//   E2E_BASE_URL   the web app (default http://127.0.0.1:5178), which proxies /api to the API
//   E2E_MAIL_DIR   where the SMTP sink saves emails as .eml (default /home/claude/devsvc/mail)
//   E2E_SMS_DIR    where the file SMS backend saves texts (default /home/claude/devsvc/sms)
//   E2E_API_DIR    the api/ folder, where dev-login runs (default ../api next to web/)
//   E2E_DEV_LOGIN  the dev-login command (default "uv run --no-sync python -m app.cli dev-login")
//   E2E_STATE_DIR  where sessions and the run's details are kept between projects (default: a temp folder)
//   E2E_KEEP=1     keep what the run created (no account deletion, no clean-up at the end)
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5178';

export const env = {
  baseURL,
  host: new URL(baseURL).hostname,
  mailDir: process.env.E2E_MAIL_DIR ?? '/home/claude/devsvc/mail',
  smsDir: process.env.E2E_SMS_DIR ?? '/home/claude/devsvc/sms',
  apiDir: process.env.E2E_API_DIR ?? path.resolve(here, '..', '..', 'api'),
  devLogin: process.env.E2E_DEV_LOGIN ?? 'uv run --no-sync python -m app.cli dev-login',
  stateDir: process.env.E2E_STATE_DIR ?? path.join(os.tmpdir(), `dsba-e2e-${new URL(baseURL).port || 'default'}`),
  keep: process.env.E2E_KEEP === '1',
};
fs.mkdirSync(env.stateDir, { recursive: true });

// ── the run: who signed up, and where their sessions are ──────────────────────────────────────

export type Persona = 'sara' | 'ali' | 'rep' | 'admin';

export interface RunInfo {
  /** a short tag in everything this run creates, so it can be found (and cleaned up) again */
  tag: string;
  sara: { name: string; local: string; e164: string; email: string };
  ali: { name: string; email: string };
  rep: { name: string; email: string };
  admin: { name: string; email: string };
  /** filled in as the run goes, for the clean-up */
  created: { threads: string[]; items: string[]; events: string[]; issues: string[] };
}

const runFile = path.join(env.stateDir, 'run.json');
export const statePath = (who: Persona): string => path.join(env.stateDir, `${who}.json`);

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** A new run: new students (a Bahraini mobile and an email address nobody uses), the same rep and admin. */
export function newRun(): RunInfo {
  const tag = `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
  const local = `3${'369'[Math.floor(Math.random() * 3)]}${randomDigits(6)}`; // 33xx, 36xx or 39xx xxxx
  const run: RunInfo = {
    tag,
    sara: { name: 'Sara E2E', local: `${local.slice(0, 4)} ${local.slice(4)}`, e164: `+973${local}`, email: `sara.e2e.${tag}@example.com` },
    ali: { name: 'Ali E2E', email: `ali.e2e.${tag}@example.com` },
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

// ── one-time codes ──────────────────────────────────────────────────────────────────────────

function newestCode(kind: 'email' | 'sms', to: string, since: number): string | null {
  const dir = kind === 'email' ? env.mailDir : env.smsDir;
  const files = fs
    .readdirSync(dir)
    .filter((f) => (kind === 'email' ? f.endsWith('.eml') : f.includes(to)))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter((x) => x.t >= since - 2000)
    .sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (kind === 'email') {
      const toLine = /^To:\s*(.*)$/im.exec(raw)?.[1] ?? '';
      if (!toLine.toLowerCase().includes(to.toLowerCase())) continue;
      const m = /Your DSBA Hub code: (\d{6})/.exec(raw);
      if (m) return m[1];
    } else {
      const m = /code is (\d{6})/.exec(raw);
      if (m) return m[1];
    }
  }
  return null;
}

/** The newest code sent to an email address or an E.164 number since `since` (Date.now() before asking). */
export async function waitForCode(kind: 'email' | 'sms', to: string, since: number): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(() => (code = newestCode(kind, to, since)), { message: `a code by ${kind} for ${to}`, timeout: 20_000, intervals: [250] })
    .not.toBeNull();
  return code as unknown as string;
}

/** The newest text to an E.164 number (security notices too). */
export function newestText(e164: string): string {
  const files = fs.readdirSync(env.smsDir).filter((f) => f.includes(e164)).sort();
  const last = files[files.length - 1];
  return last ? fs.readFileSync(path.join(env.smsDir, last), 'utf8') : '';
}

// ── sessions ────────────────────────────────────────────────────────────────────────────────

const run$ = promisify(execFile);

/** A session token for a rep or an admin (development only: python -m app.cli dev-login). */
export async function devLogin(email: string, opts: { name: string; year: number; role: 'moderator' | 'admin' }): Promise<string> {
  const [cmd, ...args] = env.devLogin.split(/\s+/);
  const { stdout } = await run$(cmd, [...args, email, '--name', opts.name, '--year', String(opts.year), '--role', opts.role], {
    cwd: env.apiDir,
    timeout: 60_000,
  });
  const token = stdout.trim().split('\n').pop()?.trim() ?? '';
  if (!/^[\w-]{20,}$/.test(token)) throw new Error(`dev-login printed no token: ${stdout.slice(0, 200)}`);
  return token;
}

/** Every page in the suite hides Mini Noora (her hint covers the bottom-right corner) unless a test wants her,
 * and a guest starts on Year 2 unless the test chooses otherwise (no first-visit dialog). */
export async function prepareContext(ctx: BrowserContext, { noora = false, year = '2' }: { noora?: boolean; year?: string | null } = {}): Promise<void> {
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

export async function personaContext(browser: Browser, who: Persona, opts: Parameters<typeof prepareContext>[1] & { mobile?: boolean } = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    baseURL: env.baseURL,
    storageState: statePath(who),
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

export async function api<T>(page: Page, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, data?: unknown): Promise<{ status: number; body: T }> {
  const headers = method === 'GET' ? {} : await csrf(page.context(), page.request);
  const r = await page.request.fetch(url, { method, headers, data: data === undefined ? undefined : data });
  const text = await r.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: r.status(), body: body as T };
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
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function docx(paragraphs: string[]): Buffer {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('');
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
  docx: string;
  ipynb: string;
  csv: string;
  png: string;
  exe: string;
  fakePdf: string;
  tooBig: string;
}

/** Writes the run's upload files (real files, plus three wrong ones) and returns their paths. */
export function makeFiles(tag: string): TestFiles {
  const dir = path.join(env.stateDir, `files-${tag}`);
  fs.mkdirSync(dir, { recursive: true });
  const p = (name: string) => path.join(dir, name);
  const files: TestFiles = {
    dir,
    pdf: p(`ST2133 MGF summary ${tag}.pdf`),
    docx: p(`EC1002 elasticity notes ${tag}.docx`),
    ipynb: p(`ST2195 pandas practice ${tag}.ipynb`),
    csv: p(`ST2187 sales data ${tag}.csv`),
    png: p(`ST2133 working ${tag}.png`),
    exe: p('ST2133 solutions setup.exe'),
    fakePdf: p('ST2134 past paper 2024.pdf'),
    tooBig: p('ST2195 all lecture recordings.pdf'),
  };
  if (!fs.existsSync(files.pdf)) {
    fs.writeFileSync(files.pdf, pdf([`ST2133 moment generating functions (${tag})`, 'M_X(t) = E[e^{tX}]', 'Poisson: exp(lambda(e^t - 1))', 'Normal: exp(mu t + sigma^2 t^2 / 2)']));
    fs.writeFileSync(files.docx, docx(['EC1002 Price elasticity of demand', 'PED = % change in quantity / % change in price.', 'Use the midpoint formula and show it.']));
    fs.writeFileSync(
      files.ipynb,
      JSON.stringify({
        cells: [
          { cell_type: 'markdown', metadata: {}, source: ['# ST2195 pandas practice'] },
          { cell_type: 'code', execution_count: 1, metadata: {}, outputs: [], source: ["import pandas as pd\n", "df = pd.read_csv('2005.csv')\n", 'df.head()'] },
        ],
        metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
        nbformat: 4,
        nbformat_minor: 5,
      }),
    );
    fs.writeFileSync(files.csv, ['advertising,price,sales', '120,4.5,210', '340,3.9,288', '510,5.2,301', '760,4.1,402'].join('\n') + '\n');
    fs.writeFileSync(files.png, png());
    fs.writeFileSync(files.exe, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 1)]));
    fs.writeFileSync(files.fakePdf, '<!doctype html><html><body><h1>ST2134 2024</h1><script>document.title="x"</script></body></html>');
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
