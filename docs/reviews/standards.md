# Standards review

2026-10-13. This review checked the coding standards written in `docs/backend/ARCHITECTURE.md` (backend and
frontend conventions, the security baseline), the README's checks and the tool settings (ruff, mypy, tsconfig,
ESLint) against their official sources. It then sampled the code to see whether it follows them. Mohamed asked for
it on 2026-10-12, together with the skills, CLAUDE.md, the README and the pre-push hook, which are already in.

## Verdict

The written standards are sound and the code follows them. The tools enforce most of them, and every check
passes. Four things were tightened and applied in this review. Eight more are recommended below, ranked. The most
valuable is typed linting: 24 places where a failed promise would go unseen.

## Changed in this review

| What | Why |
|---|---|
| **ruff** now also selects `FAST`, `ASYNC`, `PERF`, `PIE` and `FURB` (`api/pyproject.toml`) | `FAST002` enforces FastAPI's `Annotated` style for dependencies, which the brief asks for. The rest catch blocking calls in async code and common performance slips. The code had one finding, a needless `"Z"` replacement in a test, which is fixed. |
| **TanStack Query's ESLint plugin** (`@tanstack/eslint-plugin-query`, `flat/recommended`) | TanStack's docs recommend it. It found one real issue: the session query read the query client from a closure. It now takes it from the query function's context (`AuthProvider.tsx`). |
| **`ARCHITECTURE.md`**, development environment | The section described the old cloud machine (its folders and shared servers). It now covers Docker and the setup without Docker. |
| **`ARCHITECTURE.md`**, new or sharper rules | Five rules: <ul><li>path operations are plain `def`, and why;</li><li>the ruff rule sets;</li><li>TanStack Query's lint rules and the context client;</li><li>effects only for syncing with the outside world;</li><li>sessions and CSRF described precisely (256-bit tokens, SameSite=Lax, no idle timeout yet, OWASP's signed double-submit).</li></ul> |

## Checked against the sources

| Rule in the docs | Source | Does the code follow it? |
|---|---|---|
| Dependencies and parameters declared with `Annotated` | FastAPI's own skill (`.claude/skills/fastapi`); ruff `FAST002` | Yes: `FAST002` finds nothing |
| Handlers are `def`, because the database layer is synchronous | FastAPI's own skill: `async` only when everything inside awaits | Yes: 93 `def` handlers and no `async def` in `app/routers` |
| UTC-aware datetimes, never naive | ruff `DTZ` | Yes: `utcnow()` is `datetime.now(UTC)`, and `DTZ` is clean |
| Counters updated with SQL expressions, not read-modify-write | the brief's own rule | Yes: no `+=` on a counter column in `app/` |
| CSRF: a double-submit token bound to the session by an HMAC, with SameSite as a second layer | OWASP CSRF Prevention Cheat Sheet. It prefers the signed, session-bound form ("simply signing tokens without session binding provides minimal protection"), and calls SameSite "defense-in-depth … not a replacement". | Yes |
| Session tokens random and long, HttpOnly, Secure with the `__Host-` prefix in production, rotated at sign-in, stored hashed | OWASP session guidance | Yes (256-bit `secrets.token_urlsafe(32)`). There is no idle timeout: see S-2. |
| Uploads: an allowlist, names made by the server, a check of the first bytes, size limits, storage on another host, downloads as attachments | OWASP File Upload Cheat Sheet | Yes, except two things: images aren't re-encoded (S-3) and there's no malware scan (S-6) |
| No raw HTML from what users write | the brief, the security baseline | Yes: no `dangerouslySetInnerHTML` anywhere |
| Strict TypeScript with no `any` | TypeScript `strict`; typescript-eslint `recommended` | Yes: tsc and ESLint are clean |
| The Rules of Hooks | react.dev; `eslint-plugin-react-hooks` | Yes: lint is clean |
| Query keys hold everything the query reads | TanStack Query ESLint plugin, `exhaustive-deps` | Yes, after the one fix above |

## Recommendations not applied, ranked

**S-1, high: typed linting.**
- typescript-eslint "strongly recommend[s]" type-aware linting (`recommendedTypeChecked`). Switching it on today
  finds 74 problems:

  | Rule | Count | What it means |
  |---|---|---|
  | `no-floating-promises` | 16 | a promise whose failure nobody sees |
  | `no-misused-promises` | 8 | an async function passed where nothing waits for it, such as an event handler |
  | `unbound-method` | 9 | |
  | `require-await` | 7 | |
  | `no-unnecessary-type-assertion` | 32 | can be fixed automatically |
  | others | 2 | |

- Fix the 24 promise problems first, since those can hide real errors. Then change `tseslint.configs.recommended`
  to `recommendedTypeChecked` in `web/eslint.config.js`.

**S-2, medium: a session idle timeout (Mohamed's call).**
- OWASP's testing guide says every application "should implement an idle or inactivity timeout", enforced on the
  server. Its example is about an hour for a public forum.
- Today a session lasts up to 30 days whatever happens, and step-up protects only the sensitive actions.
- Two options:
  - an idle limit of 7–14 days for ordinary sign-ins;
  - the "shared computer" sign-in already on the list, with a short session.
- The server already records `last_seen_at`, so either is a small change.

**S-3, medium: re-encode uploaded pictures.** OWASP recommends decoding and re-encoding images. Here the main
gain is privacy: a phone photo of a whiteboard can carry the student's location in its metadata. Re-encode library
and forum images when the upload is completed, for example with Pillow, keeping the format.

**S-4, medium: `noUncheckedIndexedAccess`.** This TypeScript option isn't part of `strict`. It makes `array[i]`
possibly `undefined`, which catches off-by-one and empty-list bugs. It finds 122 errors today. Turn it on folder
by folder.

**S-5, low: two more layers.**
- A `Permissions-Policy` header in the Caddyfile: camera, microphone, geolocation and payment off. The app uses
  none of them.
- A Fetch Metadata (`Sec-Fetch-Site`) or `Origin` check as a second CSRF layer, which OWASP describes as
  lightweight. It needs a fallback for older browsers.

**S-6, low: malware scanning for uploads,** for example ClamAV in the sweep or on completion. What makes up for it
today: reps review every student upload before it's published, and only PDFs and images open in the browser.

**S-7, low: effects that copy props into state.** Examples are `AccountPage` (the form from `me`), `CodeEntry`
and `UploadDialog`. react.dev suggests resetting with a `key`, or deriving during render.

**S-8, skip: `exactOptionalPropertyTypes`.** It finds 77 errors and is worth little here.

Also left off on purpose:
- ruff `T20` (`print`): the CLI prints by design.
- ruff `ERA` (commented-out code): it flagged a formula written as a comment.

## Sources

- FastAPI's skill, shipped in the `fastapi` 0.143.0 package: `.claude/skills/fastapi/SKILL.md` (see
  [library-skills.io](https://library-skills.io))
- [Ruff: FAST002, fast-api-non-annotated-dependency](https://docs.astral.sh/ruff/rules/fast-api-non-annotated-dependency/)
- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Web Security Testing Guide: Testing Session Timeout](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/07-Testing_Session_Timeout)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [typescript-eslint: Linting with Type Information](https://typescript-eslint.io/getting-started/typed-linting)
- [TanStack Query: ESLint Plugin Query](https://tanstack.com/query/latest/docs/eslint/eslint-plugin-query)
- [react.dev: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

## How the counts were made

Each stricter setting was run once against the code at this review's commit:
- `npx tsc -p tsconfig.json --noUncheckedIndexedAccess`, and the same with `--exactOptionalPropertyTypes`;
- ESLint with `recommendedTypeChecked` added through a temporary config;
- `ruff check --select FAST,ASYNC,PERF,PIE,FURB,T20,ERA`.
