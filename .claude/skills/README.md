# Skills for this repo

Claude Code loads these when a task matches a skill's description. Each skill is a folder with a `SKILL.md`, plus
any references it opens on demand.

## Written for DSBA Hub

| Skill | Use it when |
|---|---|
| `fastapi-endpoint` | adding or changing an API endpoint, end to end, through to the regenerated web types |
| `db-migration` | anything under `api/app/models` changes |
| `react-feature` | building or changing anything in `web/src` |
| `e2e-test` | writing, running or fixing the Playwright suite in `web/e2e` |
| `review-checklist` | before merging a branch into `feature/backend` |

## Ported, with their licences

| Skill | From | Licence | Changes |
|---|---|---|---|
| `fastapi` | FastAPI's own skill, shipped inside the `fastapi` 0.143.0 package (`fastapi/.agents/skills/fastapi`); see [library-skills.io](https://library-skills.io) | MIT, `fastapi/LICENSE` | A "DSBA Hub note" at the top lists where this repo differs |
| `react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), `skills/react-best-practices`, commit 063bee94c3f4 | MIT, `react-best-practices/NOTICE` | SKILL.md rewritten for a Vite SPA on React 18. The Next.js server, hydration, SWR and React 19-only rules are left out; the 49 rules kept are unchanged |
| `systematic-debugging` | [obra/superpowers](https://github.com/obra/superpowers), commit bb92a7774141 | MIT, `LICENSE` in the folder | Cross-references point to this repo's tests and skills; the author's pressure-test notes are left out |
| `verification-before-completion` | obra/superpowers | MIT | None |
| `using-git-worktrees` | obra/superpowers | MIT | None |
| `dispatching-parallel-agents` | obra/superpowers | MIT | None |

## Looked at and not taken

- **Vercel `web-design-guidelines`:** it downloads its rules from a URL every time it runs. The `ui-ux-reviewer`
  agent and `react-feature` cover the same ground without fetching instructions from outside the repo.
- **Anthropic `webapp-testing`:** it's Python Playwright with its own server helper. The `e2e-test` skill fits this
  repo's TypeScript suite and fixtures.
- **Community FastAPI templates** (for example `fastapi-templates` in wshobson/agents): they scaffold new projects on
  async SQLAlchemy. This repo is synchronous and already structured, and FastAPI's own skill is the better source.
- **Playwright Test Agents** (`npx playwright init-agents --loop=claude`, Playwright 1.56+): they generate planner,
  generator and healer agents. Worth trying once the e2e suite runs on Docker (`docs/STATUS.md`).

## Refreshing them

- **`fastapi`:** after upgrading FastAPI, copy `fastapi/.agents/skills/fastapi` from the installed package again,
  then put the DSBA Hub note back. `uvx library-skills` can also do it.
- **The others:** compare with the source repository at a newer commit, keep the licence files, and update the
  commit numbers here.
