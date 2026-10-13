---
name: review-checklist
description: The checklist to run before merging any branch into feature/backend in DSBA Hub — scope, security, data, code quality, UI, tests and docs — with the commands that prove each point. Use when reviewing your own or an agent's branch, before a merge, or when asked "is this ready?".
---

# Before merging into `feature/backend`

Work through it against `git diff origin/feature/backend...HEAD`. Every "yes" needs evidence: a command's output,
a test or a screenshot (the `verification-before-completion` skill). The specialist agents in `.claude/agents/`
go deeper: `security-reviewer`, `code-quality-reviewer`, `ui-ux-reviewer` and `student-tester`.

## Scope
- [ ] The branch does what was asked, and nothing unrelated slipped in. No `master` or `gh-pages` changes.
- [ ] No secrets, no `.env` files, and no real students' emails or numbers: `git diff … | grep -iE 'key|secret|token|password|@'`,
      then read the hits.

## Security (`docs/backend/ARCHITECTURE.md`, "Security baseline")
- [ ] Every new object route checks owner, or a holder of the area's box. Hidden, pending and removed things answer 404 to others,
      and a suspended account has no powers.
- [ ] Writes that can be abused are rate-limited (`ratelimit.enforce`), and reps' and admins' actions are audited.
- [ ] Uploads go through the allowlist and the `incoming/` → final copy with its check of the first bytes. Nothing
      is shown inline except PDFs and images.
- [ ] Public responses use `UserPublic`, never an email or a phone number. Logs contain no codes, tokens or full
      numbers.
- [ ] User content is rendered without raw HTML, and links go through `safeHref`.

## Data
- [ ] Model changes come with a reviewed migration that can be undone (the `db-migration` skill).
- [ ] API shape changes come with `api/openapi.json` and `web/src/api/schema.d.ts` regenerated in the same branch.

## Code quality
- [ ] **API:** thin routers, logic in services, errors with typed codes, no N+1 in lists, mypy strict clean.
- [ ] **Web:** generated types only, no `any`; the shared homes are used instead of new copies; features meet only
      through `public.ts`; query keys and invalidation are right.
- [ ] No dead code, debugging leftovers or commented-out blocks.

## UI (the `react-feature` skill)
- [ ] Copy is plain, short and in sentence case. Errors say what happened and what to do.
- [ ] Loading, empty and error states exist.
- [ ] Keyboard and focus work, and every field has a label.
- [ ] Responsive at 360×780, 844×390, 768×1024, 1366×768 and 1920×1080 at least: nothing scrolls sideways,
      targets are at least 44 px on touch, and prose is at most about 75 characters per line.

## Tests and checks: run them in the background
- [ ] `scripts/check.sh` passes: the API (ruff, format, mypy, pytest) and the web (tsc ×2, ESLint, Vitest, schema
      drift, build).
- [ ] New behaviour has tests: pytest for the API, Vitest for pure web logic, an e2e spec for a changed flow.
- [ ] The e2e specs this branch touches pass against a running stack (the `e2e-test` skill).

## Docs
- [ ] `docs/STATUS.md` says what this branch finished or started.
- [ ] Product decisions are recorded at the end of `ARCHITECTURE.md`.
- [ ] README and CLAUDE.md commands still work.
