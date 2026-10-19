# Deskmates v2: cast 1 (Lumen, Stacks, Binder, Jot)

These are the final vectors for the Home, library, modules and notebook desk-mates. They follow `../v2/direction.md` and
match cast 2 (Pip and Pod, Blink, Loupe):
- a 200×200 artboard, with feet or base on y = 180;
- a 5 px `#14234D` outline;
- light from the top left: a highlight in the section tint or `#8DA6FF`, and one shade, navy at 0.15 or the paper shade;
- eyes at rx 7 / ry 8.5 with a 2.5 px catch-light;
- cheeks `#FF8FA3` at 0.7;
- a navy open smile with a pink tongue when happy;
- sparkles at 12 and 8 px, and the `#5F6F92` "z z";
- a ground shadow.

`contact-sheet.png` shows every pose at 200, 96, 48 and 24 px, on light (`#F2F5FB`) and on dark (`#0B1530`).

## Structure (every file)

| Group | What it holds |
| --- | --- |
| `#shadow` | The ground ellipse (navy at 0.12) |
| `#rim` | The 2 px `#EAF0FF` halo for dark backgrounds. It is visible by default and nearly invisible on light; hide it on light themes with `.mate-rim{display:none}` |
| `#prop` | Drawn behind the body. Lumen: the light cone (`.mate-light`) and the bulb. Stacks: the loose sheets and the paper clip. Binder: the Year 1/2/3 dividers. Jot: the pencil tail |
| `#body` | The character. The body path is the same in every state; only the arms change (raised when happy, and Lumen's waving arm) |
| `#face` > `#cheeks`, `#eyes`, `#mouth` | Swapped or animated per state |
| `#sparkles` (happy), `#zzz` (sleepy), `#motion` (Lumen's wave) | The extras for each state |

- Every group also has a `mate-<id>` class, so the styles still work after SVGO prefixes the ids on a page with
  several mates.
- Each file has `role="img"` with a `<title>` and a `<desc>`.
- The files contain no `<text>`, filters, masks, clip paths, `<image>` or `<use>`, and only colours from
  `v2/tokens.json`.
- Theme hooks:
  - `.mate-cover` is the main body fill. Binder's cover takes the module's colour on its page:
    `.mate-cover{fill:var(--module-art)}`, and `.mate-cover-line` sets the label lines to match.
  - On dark, raise Lumen's light with `.mate-light{opacity:.7}`. At the default 0.5 it turns muddy on navy, and the
    contact sheet uses 0.7.

## Lumen (Home) · `lumen-*.svg`

| State | When the app shows it | Alt text |
| --- | --- | --- |
| idle | Home greeting band; the Home shelf at 56 px | "Lumen, the desk lamp" |
| wave | Home header greeting: the first time you open Home in a session | "Lumen waving hello" |
| happy | First visit of the day (streak or "Good morning"), and the "all caught up" moments on Home | "Lumen, happy" |
| sleepy | The lamp is switched off: late at night (after 23:00), or offline. Home is never empty, so this is never an empty state | "Lumen, asleep" |

**Animation hooks:**
- Wave: rock the arm path in `#body` (the last stroke before the shade) by ±10° around (158, 80) twice, and fade
  `#motion` in and out with it.
- Lamp switching on: fade `.mate-light` in over 200 ms.

## Stacks (library) · `stacks-*.svg`

| State | When the app shows it | Alt text |
| --- | --- | --- |
| idle | Library header | "Stacks, the stack of papers" |
| happy | Toast after an upload is published ("Uploaded. It's in ST2133 · May 2019.") and after a timed paper ends ("Done in 2:51. Mark it?") | "Stacks, happy" |
| sleepy | No papers match the filters ("No papers match ST2133 · 2014. Try another year or clear filters.") | "Stacks, asleep" |

**Animation hooks:** the loose sheets in `#prop` can lift 3 px when a new file lands.

## Binder (modules) · `binder-*.svg`

| State | When the app shows it | Alt text |
| --- | --- | --- |
| idle | Module header (the cover in the module's colour); My modules | "Binder, the ring binder" |
| happy | Toast when a lesson is done | "Binder, happy" |
| sleepy | No modules yet ("You haven't added modules yet. Pick your year to start."), and empty Lessons, Papers or Dates tabs | "Binder, asleep" |

**Animation hooks:**
- The three dividers in `#prop` are Year 1, 2 and 3, from top to bottom. The student's own year can nudge out 4 px.
- Keep the dividers in their year colours even when the cover changes colour.

## Jot (notebook) · `jot-*.svg`

| State | When the app shows it | Alt text |
| --- | --- | --- |
| idle | Notebook header, beside the pen tools | "Jot, the spiral notebook" |
| happy | "Saved" toast | "Jot, happy" |
| sleepy | No notes yet ("No notes in EC2066 yet. Start one, or annotate a past paper."), and an empty module Notes tab | "Jot, asleep" |

**Animation hooks:** the pencil tail in `#prop` can wag ±6° around (150, 150) while you write.

## Shared motion

- **Blink:** every 6–11 s, scale `#eyes` to `scaleY(0.1)` for 120 ms around the eye centre. Animate one mate at a
  time, and only while it is visible.
- **Happy:** swap to the happy file, then hop 6 px (320 ms, ease-bounce) while `#sparkles` pop in.
- **Reduced motion:** no loops, hops or wags. States cross-fade in 120 ms.

**Accessibility:** when a mate sits beside a heading that already names the section, it is decorative: use
`alt=""` or `aria-hidden="true"`. Use the alt text above only when the mate carries meaning alone, such as an
empty state without a heading.

**Sizes:**
- 98–104 px in headers, 160 px in empty states, 56 px on the shelf and 40 px in toasts.
- Below 32 px, use the nav icons. At 24 px the faces no longer read; only the silhouettes do, as the contact sheet
  shows.
