# Incoming artwork

Batch 2026-10-19: six Daily PNGs and `empty-board.png` are generated and inspected, awaiting selection.
Review, native outputs, optimised exports and exact prompts: [asset catalogue](../../../../docs/design/generated/2026-10-19/CATALOGUE.md).

Drop generated files here under these exact names. Prompts: `docs/design/asset-prompts.md`, and `asset-prompts-round3.md` for Daily's games. A builder then moves each
file to its home and wires it in. All PNGs are transparent unless noted.

| File | Size | Goes to |
| --- | --- | --- |
| `hub-lockup-horizontal.png` | 2400×600 | `web/public/brand/` (header, sign-in) |
| `hub-lockup-horizontal-white.png` | 2400×600 | `web/public/brand/` (dark theme) |
| `hub-lockup-stacked.png` | 1200×900 | `web/public/brand/` (phone sign-in, footer, social cards) |
| `hub-lockup-stacked-white.png` | 1200×900 | `web/public/brand/` (dark theme) |
| `hub-icon-1024.png` | 1024×1024, opaque blue tile | `web/public/brand/` (favicon, home-screen icon) |
| `hub-icon-maskable-1024.png` | 1024×1024, opaque, mark in central 80% | `web/public/brand/` (PWA maskable icon) |
| `module-ec1002.png`, `module-mn1178.png`, `module-mt1186.png`, `module-st1215.png`, `module-st2133.png`, `module-st2134.png`, `module-st2195.png`, `module-st2187.png`, `module-ec2020.png`, `module-is2184.png` | 512×512 | `web/public/modules/` |
| `module-machine-learning.png`, `module-market-research.png`, `module-microeconomics.png`, `module-asset-pricing.png`, `module-marketing-management.png`, `module-further-maths.png` | 512×512 | `web/public/modules/` |
| `empty-nothing-due.png`, `empty-no-notes.png`, `empty-board.png`, `empty-offline.png`, `empty-search.png` | 800×600 | `web/public/illustrations/` |
| `home-welcome.png` | 2400×800 | `web/public/illustrations/` (Home header) |
| `daily-word.png`, `daily-groups.png`, `daily-search.png`, `daily-quiz.png`, `daily-nearest.png`, `daily-sudoku.png` | 1024×1024 | `web/public/daily/` (Daily's game tiles) |
