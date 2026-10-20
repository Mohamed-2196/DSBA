# DSBA Hub brand: Deskmates v2

The production brand for DSBA Hub, finished from the approved direction in `../v2/direction.md`. The logo is
fixed, the interface is calm and cool, and the desk-mates and the logo carry the personality.

## Files

| File | What it is |
| --- | --- |
| `brand-sheet.png` | Logo, colour, type, shape, icons, characters, and dos and don'ts on one page (1600 px wide) |
| `icon-sheet.png`, `icon-sheet@2x.png` | Every icon at 24, 20 and 16 px, default and active, light (`#F2F5FB`) and dark (`#0B1530`). The 1x file shows real pixels |
| `icons/nav/*.svg` | The 13 nav icons: `name.svg` (default) and `name-active.svg` |
| `icons/ui/*.svg` | 69 everyday UI icons, in the same two files each |
| `tools/` | `icondata.py` (all geometry), `build.py` (writes the SVGs and the icon sheet), `brandsheet.py`, `shot.sh` and `zoom.sh` (headless Chrome renders). From `brand/`: `python3 tools/build.py && python3 tools/brandsheet.py` |

## 1. Logo

Use the existing files from `web/public/brand/` exactly as they are. Never redraw, trace, recolour, outline,
stretch or rotate them, and never add effects.

- **Light grounds** (canvas, surface, inset): `hub-lockup-horizontal.png`.
- **Dark grounds** (canvas `#0B1530`, surface `#111E3E`, or the logo blue): `hub-lockup-horizontal-white.png`.
  Don't put the blue lockup on a dark ground, and don't put the white one on a light ground.
- **App icon:** `hub-icon.png` (512), `hub-icon-1024.png` and `hub-icon-maskable-1024.png`. The platform rounds
  the corners. Don't add a border, shadow or badge.
- **Clear space:** x is the height of the H, which is the lockup's height. Keep x clear on every side: no text,
  icons or card edges. In an app bar or sidebar, the bar's own edge can come to x/2.
- **Sizes:** 27 px tall in the sidebar, 21 px in the phone app bar, and never under 16 px. Below 16 px, use the
  app icon instead. The app icon's smallest size is 16 px, as the favicon.
- **With the programme's DSBA logo:** the official logo goes to the left, then a 1 px `line-strong` divider, with
  x between them. Place the official file as it is. Nobody draws or imitates any third-party logo.
- The logo blue is `#1F3A93`. In light mode it is also `accent-edge` and `accent-text`.

## 2. Colour

The values are in `../v2/tokens.json`, and the full contrast table is in `../v2/direction.md`. The sheet
recomputes the key pairs.

**Roles (light / dark)**

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| canvas | `#F2F5FB` | `#0B1530` | App background. Cool, never cream |
| surface / raised | `#FFFFFF` / `#FFFFFF` | `#111E3E` / `#16244A` | Cards, panels, menus |
| inset | `#ECF1F9` | `#1A2B54` | Wells, hovers, the notebook canvas |
| line / line-strong | `#DCE4F1` / `#C5D2E6` | `#22355F` / `#2F4677` | Dividers / control and chip borders |
| ink / ink-2 / ink-3 | `#0A1F44` / `#3E4E6E` / `#5A6A8C` | `#EAF0FF` / `#A9B8D9` / `#8798BE` | Text. All three pass AA on canvas, surface and inset |
| accent | `#2445C2` | `#8DA6FF` | Primary buttons, links, focus |
| accent-edge | `#1F3A93` | `#5F7BE0` | The 3 px lip on the primary button, and hover |
| accent-soft / accent-text | `#E3E9FF` / `#1F3A93` | `#1E2C66` / `#8DA6FF` | Selected rows, info, the Home band |
| on-accent | `#FFFFFF` | `#0B1530` | Text on accent |
| success | `#18794A` | `#5BD49A` | Answered, saved, watched |
| warning / warning-fill | `#8F5A00` / `#FFC233` | `#FFC233` / `#FFC233` | Warning text / badge and count fill (ink on it) |
| error | `#C0262D` | `#FF7A7A` | Errors and destructive actions |
| exam / on-exam | `#C21D5C` / `#FFFFFF` | `#FF7EB0` / `#0B1530` | Exams only. Never the same as error or calendar |
| Year 1 fill / text / soft | `#3BC9DB` / `#0A727C` / `#D7F4F7` | `#3BC9DB` / `#3BC9DB` / `#123A45` | Lagoon |
| Year 2 | `#6FA2FF` / `#1A5FCC` / `#DCE8FF` | `#6FA2FF` / `#6FA2FF` / `#1B2D55` | Sky |
| Year 3 | `#FFA94D` / `#9A5209` / `#FFE8D1` | `#FFA94D` / `#FFA94D` / `#3A2A1C` | Amber |

**Sections.** Each section has four tones. Art is the same in both themes.

| Section | Mate | Art | Light tint / pill / text | Dark tint / pill / text |
| --- | --- | --- | --- | --- |
| Home | Lumen | `#4C6EF5` | `#C9D4FF` / `#E3E9FF` / `#1F3A93` | `#33438F` / `#1E2C66` / `#8DA6FF` |
| Library | Stacks | `#FFC233` | `#FFE29A` / `#FFF1C7` / `#865C00` | `#6E5A22` / `#3A3218` / `#FFC94D` |
| Modules | Binder | `#2DB87D` | `#B9EBD2` / `#DDF5E9` / `#15744A` | `#1E5C45` / `#15382C` / `#5BD49A` |
| Notebook | Jot | `#7B61FF` | `#D9D0FF` / `#ECE7FF` / `#5B3FD9` | `#433889` / `#2A2560` / `#AD9DFF` |
| Forum | Pip and Pod | `#F25CA2` | `#FFC7E1` / `#FFE3F0` / `#B0246B` | `#6E2D55` / `#42213A` / `#FF8CC6` |
| Calendar | Blink | `#F0524B` | `#FFCBC6` / `#FFE4E1` / `#C2332B` | `#6E3036` / `#42222A` / `#FF8A80` |
| Search | Loupe | `#8E9BB8` | `#D5DCEA` / `#E6EBF4` / `#4A5878` | `#3A4870` / `#24304F` / `#AAB8D6` |
| Tools (Boards, Grades, Career Navigator, Newsletter, Daily puzzles) | none | as Home | as Home | as Home |

**What each tone is for:**
- **Art:** drawings, the active icon body and thick fills. Never text.
- **Tint:** the default icon body and quiet fills.
- **Pill:** the active nav item and section headers.
- **Text:** labels and counts in the section's colour.

**Contrast:**
- Every text pair passes AA (4.5:1). The tightest are calendar text on its pill (4.59) and ink-3 on inset (4.78).
- Art yellow `#FFC233` on white is 1.6:1, so it is never text.
- White on calendar tomato is 3.5:1, so exams use raspberry.

## 3. Type

Load all four faces from Fontsource: `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/figtree`,
`@fontsource/jetbrains-mono` and `@fontsource/ibm-plex-sans-arabic`.

- **Bricolage Grotesque** 750, optical size auto, tracking −0.025em: page titles, greetings and card titles. It has
  no Arabic, so IBM Plex Sans Arabic comes next in its stack.
- **Figtree** 400–800: everything else in the UI.
- **JetBrains Mono:** module codes and the exam timer.
- **IBM Plex Sans Arabic** 400–700: in every stack. Arabic body text uses line height 1.75 and is set right-aligned.

| Token | px / line | Weight | Face |
| --- | --- | --- | --- |
| display-xl | 44 / 48 | 750 | Bricolage |
| display | 34 / 40 | 750 | Bricolage |
| title (phone page title) | 28 / 34 | 750 | Bricolage, −0.02em |
| heading | 22 / 28 | 750 | Bricolage, −0.015em |
| subhead | 17 / 24 | 700 | Figtree |
| body / body-sm | 16 / 25, 14 / 21 | 400 | Figtree |
| nav | 15 / 20 | 500, active 700 | Figtree |
| meta / tab label | 13 / 18, 12 / 16 | 500 / 600, active 800 | Figtree |
| overline | 12 / 16, caps, +0.1em | 800 | Figtree |
| timer / code | 40 / 44, 13 / 18 | 700 / 500 | JetBrains Mono |
| arabic-body | 16 / 28 | 400 | IBM Plex Sans Arabic |

Running text stops at about 75 characters (`tokens.json` says 68ch; re-measure in Figtree, see below).

## 4. Shape, depth and motion

**Radii:**

| Element | Radius |
| --- | --- |
| Document thumbnail | 6 |
| Button | 13 |
| Input | 14 |
| Nav item | 14 |
| Tab pill | 17 |
| Card | 18 |
| Panel | 22 |
| Sheet | 28 |
| Chip | pill |

**Depth:**
- Cards are index cards: a 1.5 px `line` border plus a card shadow.
- Light shadows: card `0 2px 6px rgba(10,31,68,.07)`, float `0 8px 20px rgba(10,31,68,.21)`.
- Dark shadows: card `0 2px 6px rgba(0,0,0,.35)`, float `0 8px 24px rgba(0,0,0,.6)`.
- The primary button has a 3 px lip, `inset 0 -3px 0 var(--accent-edge)`. On press it moves down 2 px and loses
  the lip.
- Controls are at least 44 px on touch screens, and inputs are 46–48 px tall.

**Motion:**
- Durations are 140 / 200 / 320 ms on `cubic-bezier(.2,.8,.2,1)`. The happy hop uses
  `cubic-bezier(.34,1.56,.64,1)`.
- With reduced motion there are no transforms or loops, and states cross-fade in 120 ms.

## 5. Icons

**Rules for the whole family:**
- **Grid:** 24 px with a 2 px safe margin. Paths stay between 2.5 and 21.5.
- **Stroke:** 1.75 px with round caps and joins. Corner radii are 1–3. The search handle is the one heavy line,
  at 2.75.
- **Two tones:**
  - Lines and dots use `currentColor`.
  - One body is filled with `var(--icon-tint)`.
  - Paper parts (sheets, faces and screens that have to cover what's behind them) are filled with
    `var(--icon-paper)`.
  - Arrows, chevrons, close, plus, check, sort, link, reply and similar marks are line only.
- **Not allowed:** `<text>`, filters, masks, clip paths or `<use>`. Each file is plain `<path>` elements inside one
  `<svg>` with `aria-hidden="true"`. The button or link carries the accessible name.
- **Active files** (`*-active.svg`) have the same geometry with a 1.85 px stroke (2.85 for the search handle).
  The app switches files and sets the variables:

```css
.icon          { color: var(--icon-line);        --icon-tint: var(--sec-tint); --icon-paper: var(--surface); }
.icon.is-active{ color: var(--icon-line-active); --icon-tint: var(--sec-art);  --icon-paper: var(--sec-pill); }
/* a nav item sets --sec-tint/--sec-art/--sec-pill/--sec-text from its section; UI icons default to Home's */
```

- **Active nav state:**
  - The line turns navy, `#14234D` in light and `#EAF0FF` in dark.
  - The body takes the section's art colour, and the paper takes the pill colour.
  - The item sits on the pill, with a bold label in the section text colour.
  - That is three changes, so the state never relies on colour alone.
- **Status icons** (success, info, warning, error, question, offline) take the tint of the matching tone:
  - success uses the modules tint;
  - warning uses the library tint;
  - error uses the calendar tint;
  - info and question use the Home tint;
  - offline uses the search tint.
- **Fallbacks:** without the variables, for example in an `<img>`, the body is `currentColor` at 22% (55% when
  active) and paper is white. Inline the SVGs (SVGR, or one `<Icon name>` component) so that theming works.
- **Sizes:**
  - 24: tab bar and top bar.
  - 20: sidebar, buttons and inputs.
  - 16: inline meta only, never on its own as a button.
  - Above 32 px, use a desk-mate, not a bigger icon.
- **Pixel check:**
  - At 24 px (1x), outer frames sit on whole or half pixels, and every icon keeps a solid core line.
  - At 20 px the 5/6 scale can't hold the grid, so lines are slightly soft at 1x and sharp at 2x and above.
  - Every icon was checked at 16 px on `icon-sheet.png`. One fix came from that check: Grades now has a 2 × 2
    keypad (it had 3 × 3), because the nine keys merged into a grey block at 16 and 20 px. Upload and download
    got a thinner tray and longer arrows.
- **New icons:** draw the object a student touches for the task. It has to read at 16 px. Use one tinted body,
  plus paper parts if needed. No symbols, flags of countries or logos.

**Nav icons (13):** home (desk lamp), modules (ring binder), library (papers on booklets), notebook, forum,
calendar, boards, grades, career (compass), newsletter, daily (puzzle grid), search (magnifier) and more.

**UI icons (169).** `tools/icondata.py` draws them and `python3 tools/build.py` writes `icons/ui/` and
`tools/_icon-sheet.html` (rendered as `icon-sheet.png` and `icon-sheet@2x.png`). The web app's glyph modules come from
`web/scripts/icons.mjs`. Every icon in the app is from this family; there is no second icon library.

| Group | Icons |
| --- | --- |
| Actions | plus, close, check, edit, trash, copy, link, external, share, upload, download, refresh, undo, send, attach, filter, sort, more, more-vertical, drag |
| Direction | back, forward, arrow-up, arrow-down, chevron-left/right/up/down, swap |
| Study | bookmark, star, timer, clock, deadline, exam, calendar-add, calendar-check, page, folder, pen, highlighter, eraser, pin, unpin, image, image-broken, video, play, pause, stop, playlist, headphones, list, sidebar, book, teacher, cap, notepad |
| Forum and account | reply, vote, thumbs-up, flag, bell, bell-off, mail, phone, user, people, chat, tag, heart, smiley, bulb, mic, rocket, megaphone, sign-in, sign-out, power, settings, sun, moon, eye, eye-off, lock, unlock, key, blocked, shield-check, shield-alert, sparkle |
| Daily and badges | flame, snowflake, trophy, crown, medal, bolt, backspace, grid-view, rows |
| Charts and data | chart-bar, chart-line, chart-pie, chart-scatter, trend-up, database, presentation, formula, sigma, math, wave, terminal, brain, chip, target, coins |
| Career | briefcase, bank, building, tower, cloud, card, factory, handshake, scales, vault, flask, shop |
| Devices | mobile, tablet, monitor, keyboard, bug |
| Notebook and editors | hand, pointer, laser, lasso, signature, code, list-numbers, checklist, quote, bold, italic, underline, text, align-left/center/right, zoom-in, zoom-out, expand, collapse, crop, layer-up, layer-down, print, fill, swatches |
| File types | file-pdf, file-sheet, file-slides, file-image (a written file is `page`) |
| Status | success, info, warning, error, question, offline |

- **Letters without `<text>`:** bold, italic, underline, text, sigma and formula are drawn as paths. Bold uses the
  heavy line.
- **File types:** no letters. The mark on the page says the kind: a block (PDF), a grid (sheet), bars (slides), a
  picture (image).
- **Layers:** layer-up puts the tinted square on top of the paper one; layer-down puts it underneath.
- **Third-party logos are never drawn.** Share to WhatsApp uses `chat` with the words "WhatsApp" beside it; YouTube
  videos use `video`.
- **16 px check:** chart-bar has wide bars and no baseline; brain, teacher, coins, lasso, handshake, swatches and
  list-numbers use few, large parts so they stay apart at 16 px.

## 6. The desk-mates

Lumen (Home), Stacks (Library), Binder (Modules), Jot (Notebook), Pip and Pod (Forum), Blink (Calendar) and
Loupe (Search). The art is in `../v2/sections/`, and the happy and sleepy states are in `../v2/sections/states/`.

**Where they go:**
- Section headers, at 98–104 px, idle: they show where you are. On phones the band is one line (the title and one
  stat line), and its mate is 64–72 px (60 px under 375 px wide).
- Empty states, at 160 px, sleepy, with a line that says what to do next (112 px in a small empty state).
- Success toasts, at 40 px, happy, with a 6 px hop (32 px in a compact one-line toast).
- The Home shelf, at 56 px, phones included: there the shelf wraps to two rows rather than scroll.
- Blink beside Home's "Up next".

On dark grounds, give them a 2 px `#EAF0FF` halo.

**When not to use them:**
- One mate per view. Two mates never compete.
- Never in Noora's chat. Noora is the only person, so there are no new faces, people or mascots.
- Never below 32 px. The nav icon takes over there.
- Never cheerful on a failure. Error messages and failed uploads use the plain error style, with no happy face.
- Never as a nav icon, a bullet or decoration.

## 7. Do and don't

- **Do** set section labels in the text tone on the pill (Library `#865C00` on `#FFF1C7` is 5.26:1). **Don't**
  set art colours as text.
- **Do** place the lockup file as it is, with clear space. **Don't** redraw, recolour, outline, stretch or rotate
  it, or put it on a photo or a section colour.
- **Do** keep one icon family per row. **Don't** mix Deskmates and Phosphor side by side.
- **Do** show exams in raspberry `#C21D5C`. **Don't** use calendar tomato or error red for exams.
- **Do** change three things for the active state (line, fill and pill). **Don't** change colour alone.
- **Do** keep the five tools in Home's blue. **Don't** give each tool its own loud colour.

## 8. Web token mapping (`web/src/styles/tokens.css`)

Nothing is released yet, so rename directly with no aliases. Each rename is a mechanical `sed` across `web/src`.

### Colour, light (`:root, [data-theme='light']`)

| Variable | Now | v2 | Note |
| --- | --- | --- | --- |
| `--paper` | `#f4f7fc` | `#F2F5FB` | canvas |
| `--surface` | `#ffffff` | `#FFFFFF` | unchanged |
| `--surface-2` | `#eaf0f9` | `#ECF1F9` | inset |
| `--ink` | `#0a1f44` | `#0A1F44` | unchanged |
| `--ink-2` | `#425372` | `#3E4E6E` | |
| `--ink-3` | `#7587a6` | `#5A6A8C` | Now AA for small text (4.96 on canvas). Drop the "NOT AA" comment |
| `--line` | `#dce5f2` | `#DCE4F1` | |
| `--line-strong` | `#c6d3e6` | `#C5D2E6` | |
| `--control-border` | `#7f90ad` | unchanged | 3.23:1 on surface still meets 1.4.11 |
| `--cobalt` → **`--accent`** | `#1558f0` | `#2445C2` | 285 uses: rename |
| `--cobalt-ink` → **`--on-accent`** | `#ffffff` | `#FFFFFF` | |
| `--cobalt-hover` → **`--accent-hover`** | `#0f47cf` | `#1F3A93` | |
| `--cobalt-soft` → **`--accent-soft`** | `#e6eeff` | `#E3E9FF` | |
| `--navy` → **`--inverse`** | `#0c2d75` | `#0A1F44` | The one dark pill ("Filters", badges). Add `--on-inverse` `#F2F5FB` |
| `--brand` → **`--logo-blue`** | `#1558f0` | `#1F3A93` | No uses today. The Noora ring and the logo tile |
| `--highlight` | `#ffe14a` | unchanged | Highlighter marks only |
| `--signal` → **`--success-fill`** | `#12b886` | `#2DB87D` | |
| `--signal-strong` → **`--success`** | `#0a7d5b` | `#18794A` | |
| `--signal-soft` → **`--success-soft`** | `#e3f6f0` | `#DDF5E9` | |
| `--alert` → **`--error`** | `#f03e5e` | `#C0262D` | Move every exam use to `--exam` |
| `--alert-strong` | `#c81e43` | merge into `--error` | One error colour now passes AA |
| `--alert-ink` → **`--on-error`** | `#ffffff` | `#FFFFFF` | |
| `--alert-hover` → **`--error-hover`** | `#a9183a` | `#9F1F25` | Derived: white on it is 7.79 |
| `--alert-soft` → **`--error-soft`** | `#feecef` | `#FCE8E8` | Derived: error text on it is 5.02 |
| `--y1` / `--y2` / `--y3` | `#0fa3b1` / `#1f6feb` / `#f08c00` | `#3BC9DB` / `#6FA2FF` / `#FFA94D` | Fills |
| `--y1-strong` / `--y2-strong` / `--y3-strong` | `#0b7c87` / `#1a62d4` / `#a35e00` | `#0A727C` / `#1A5FCC` / `#9A5209` | Text |
| `--on-y2` | `#ffffff` | `#0A1F44` | White on the new sky is 2.53. Navy is 6.41 |
| `--on-y1`, `--on-y3` | `#0a1f44` | unchanged | |
| `--shadow-sm` → **`--shadow-card`** | `0 1px 3px …08` | `0 2px 6px rgba(10,31,68,.07)` | |
| `--shadow-float`, `--shadow-md`, `--shadow-panel` | three values | one `--shadow-float`: `0 8px 20px rgba(10,31,68,.21)` | Merge `--shadow-md` and `--shadow-panel` into it |
| `--focus-color` | `var(--cobalt)` | `var(--accent)` | |
| `--art-tile` | `#eef3fc` | `#ECF1F9` | |
| `--mine-*`, `--thumb-*`, `--scrim`, `--key-spent*`, `--tile-stroke`, `--highlight-*` | | unchanged | |

### Colour, dark (`[data-theme='dark']`)

| Variable (new name) | Now | v2 |
| --- | --- | --- |
| `--paper` | `#07122b` | `#0B1530` |
| `--surface` | `#0d1b3b` | `#111E3E` |
| `--surface-2` | `#14264f` | `#1A2B54` |
| `--ink` / `--ink-2` / `--ink-3` | `#ecf2ff` / `#a6b6d8` / `#7488b0` | `#EAF0FF` / `#A9B8D9` / `#8798BE` |
| `--line` / `--line-strong` | `#213563` / `#2f477e` | `#22355F` / `#2F4677` |
| `--control-border` | `#5670a6` | unchanged (3.33 on the new surface) |
| `--accent` / `--on-accent` | `#6fa2ff` / `#07122b` | `#8DA6FF` / `#0B1530` |
| `--accent-hover` / `--accent-soft` | `#96bbff` / `#173066` | `#A9BCFF` / `#1E2C66` |
| `--inverse` / `--on-inverse` | `#0c2d75` / – | `#EAF0FF` / `#0B1530` |
| `--logo-blue` | `#1d5ff5` | `#1F3A93` (the logo doesn't change with the theme) |
| `--success-fill` / `--success` / `--success-soft` | `#38d9a9` / `#38d9a9` / `#133e4a` | `#2DB87D` / `#5BD49A` / `#15382C` |
| `--error` / `--on-error` / `--error-hover` / `--error-soft` | `#ff6b81` / `#07122b` / `#ff8a9c` / `#3a1f45` | `#FF7A7A` / `#0B1530` / `#FF9A9A` / `#3F1F26` |
| `--y1` / `--y2` / `--y3` (and `-strong`) | `#3bc9db` / `#5e9bff` / `#ffa94d` | `#3BC9DB` / `#6FA2FF` / `#FFA94D` |
| `--on-y1..3` | `#07122b` | `#0B1530` |
| `--shadow-card` / `--shadow-float` | | `0 2px 6px rgba(0,0,0,.35)` / `0 8px 24px rgba(0,0,0,.6)` |

### New colour variables (both themes, values in section 2)

- `--raised` (`#FFFFFF` / `#16244A`), `--accent-edge` (`#1F3A93` / `#5F7BE0`) and `--accent-text` (`#1F3A93` /
  `#8DA6FF`).
- `--press-edge: inset 0 -3px 0 var(--accent-edge)`.
- `--warning` (`#8F5A00` / `#FFC233`), `--warning-fill` (`#FFC233`) and `--warning-soft` (`#FFF1C7` / `#3A3218`).
  Warning has no token today.
- `--exam` (`#C21D5C` / `#FF7EB0`), `--on-exam` (`#FFFFFF` / `#0B1530`) and `--exam-soft` (`#FCE4EE` / `#3E1B2E`).
  The two soft values are derived; exam on them is 4.82 and 6.33.
- `--y1-soft`, `--y2-soft` and `--y3-soft`.
- 32 section variables: `--sec-{home,library,modules,notebook,forum,calendar,search,tools}-{art,tint,pill,text}`.
  A component sets the short forms `--sec-art`, `--sec-tint`, `--sec-pill` and `--sec-text` from one of these.
- Icon variables: `--icon-line` (`#3E4E6E` / `#A9B8D9`) and `--icon-line-active` (`#14234D` / `#EAF0FF`).
  `--icon-tint` and `--icon-paper` are set per use (section 5).
- Art variables: `--art-outline` (`#14234D`) and `--art-halo` (`#EAF0FF`, dark only).
- Noora variables: `--noora-frame` (`#E6E0FA` / `#2A2F5E`), `--noora-ring` (`#1F3A93` / `#8DA6FF`) and
  `--noora-online` (`#18794A` / `#5BD49A`).

### Non-colour (`:root`)

| Variable | Now | v2 |
| --- | --- | --- |
| `--font-sans` → **`--font-ui`** | Schibsted Grotesk … | `'Figtree Variable', 'Figtree', 'IBM Plex Sans Arabic', ui-sans-serif, system-ui, sans-serif` |
| `--font-serif` → **`--font-display`** | Newsreader … | `'Bricolage Grotesque Variable', 'Bricolage Grotesque', 'IBM Plex Sans Arabic', system-ui, sans-serif`. Its 37 uses are headings and Noora's name. Check that each one is a display use |
| `--font-mono` | JetBrains Mono | unchanged |
| `--tracking-display` | `-0.03em` | `-0.025em` |
| `--measure` | `54ch` | Re-measure for Figtree at 16 px against the 75-character rule. `tokens.json`'s 68ch is the upper bound |
| `--measure-serif` | `50ch` | remove (no serif body text) |
| `--fs-25 … --fs-76` | major-third steps | Replace with `--fs-17`, `--fs-22`, `--fs-28`, `--fs-34` and `--fs-44` (the v2 scale). Keep 11–16, 18 and 20 |
| `--r-control` | `10px` | `13px` (buttons) |
| `--r-panel` → **`--r-card`** | `16px` | `18px` |
| `--r-feature` → **`--r-panel`** | `24px` | `22px` |
| `--r-xs` | `6px` | unchanged (doc thumbnails) |
| `--dur-fast` / `--dur-slow` | `150ms` / `250ms` | `140ms` / `320ms` |
| `--rail-w` | `264px` | `248px` |
| `--tabbar-h` | `64px` | `84px`, plus `env(safe-area-inset-bottom)` |

**New non-colour variables:**
- `--fw-display: 750` and `--lh-arabic: 1.75`.
- `--r-input: 14px`, `--r-nav: 14px`, `--r-tab: 17px` and `--r-sheet: 28px`.
- `--ease-bounce: cubic-bezier(.34,1.56,.64,1)` and `--touch-min: 44px`.

**To remove:** the Schibsted Grotesk and Newsreader Fontsource packages.

## Open points

- The logo is PNG only. Ask for SVG masters of the existing lockup and icon if they exist. Don't trace them.
- `--measure` needs a real measurement in Figtree.
- `--shadow-md` and `--shadow-panel` merge into `--shadow-float`. Check the 9 places that use them.
- The 20 px icons are slightly soft at 1x. They are sharp on 2x and 3x screens, which covers current phones.
