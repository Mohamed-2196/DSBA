# Deskmates v2

**The study desk, and the friends who live on it, now in the hub's own blue.** Every core section of DSBA Hub
has a small companion made from the object you use there. A stack of papers for the library, a ring binder for
modules, a spiral notebook with a pencil tail, two speech bubbles for the forum, a tear-off calendar page that
blinks, a desk lamp for Home and a magnifying glass for search. They are soft, chunky, rounded vector characters
with a navy outline and gentle faces, and they sit beside **Mini Noora** as her desk-mates. She stays the only
person.

Each character is useful. It tells you where you are (the section header and the Home shelf), and it tells you
what happened: happy means it worked, sleepy means there is nothing here yet. Around them the interface is calm
and cool, so the characters and the logo carry the personality.

## What changed from v1, and why

| v1 | v2 | Why |
| --- | --- | --- |
| Own logo (two books with a pencil) | **The existing DSBA Hub logo, unchanged.** `hub-lockup-horizontal.png` on light, `hub-lockup-horizontal-white.png` on dark, `hub-icon.png` as the app icon. Placed with `<image>`, never redrawn or recoloured. | Mohamed's call. The logo's royal blue (about `#1F3A93`) now anchors the palette. |
| Warm cream paper, terracotta accent, plum outline | **Cool paper `#F2F5FB` and white surfaces, a royal accent `#2445C2` related to the logo, navy ink `#0A1F44`, navy art outline `#14234D`** | It follows the hub's rule "cool, never cream" and sits with the logo instead of against it. |
| Section colours: mustard, teal, indigo, plum, sky | **Library yellow, Modules mint, Notebook violet, Forum pink, Calendar tomato, Home royal, Search steel** | Clean, saturated hues around the royal blue. Each has a light pill, a tint, and a text tone that passes AA. Yellow is the logo's complement, so the most-used section stands out. |
| Fraunces (soft serif) for display | **Bricolage Grotesque** 750 for display, Figtree for UI | The logo is a heavy grotesk wordmark. A serif heading next to it gave two voices. Bricolage is a characterful grotesk with optical sizes and soft, ink-trap-like corners. It matches the logo's weight and the chunky characters, and still reads as grown-up. Figtree stays because it is very legible at 12–13 px on phones. |
| Coloured dots and empty squares in the sidebar | **A crafted 13-icon nav family** (below) | Mohamed: "the sidebar icons need more effort". |
| Lumen and Loupe only described | **Drawn**, with all states | Complete cast. |

What stays from v1: the layouts (sidebar and content on laptops; a bottom tab bar and Noora's launcher on
phones), the Home blocks, index-card cards, document thumbnails coloured by type, the pressable primary button,
the character family rules, the states, motion and the Noora frame.

## Palette

### Light
| Role | Hex |
| --- | --- |
| canvas / surface / inset / raised | `#F2F5FB` / `#FFFFFF` / `#ECF1F9` / `#FFFFFF` |
| line / line-strong | `#DCE4F1` / `#C5D2E6` |
| ink / ink-2 / ink-3 | `#0A1F44` / `#3E4E6E` / `#5A6A8C` |
| accent / edge (pressed lip, hover) / soft / text on soft | `#2445C2` / `#1F3A93` (= logo blue) / `#E3E9FF` / `#1F3A93` |
| success / warning (text, fill) / error / exam | `#18794A` / `#8F5A00`, `#FFC233` / `#C0262D` / `#C21D5C` (raspberry: never the same as error or calendar) |
| Year 1 / 2 / 3 | fills `#3BC9DB` lagoon / `#6FA2FF` sky / `#FFA94D` amber; text `#0A727C` / `#1A5FCC` / `#9A5209`; soft `#D7F4F7` / `#DCE8FF` / `#FFE8D1` |

### Dark
| Role | Hex |
| --- | --- |
| canvas / surface / inset / raised | `#0B1530` / `#111E3E` / `#1A2B54` / `#16244A` |
| line / line-strong | `#22355F` / `#2F4677` |
| ink / ink-2 / ink-3 | `#EAF0FF` / `#A9B8D9` / `#8798BE` |
| accent / edge / soft / on-accent | `#8DA6FF` / `#5F7BE0` / `#1E2C66` / `#0B1530` |
| success / warning / error / exam | `#5BD49A` / `#FFC233` / `#FF7A7A` / `#FF7EB0` |
| Year 1 / 2 / 3 | `#3BC9DB` / `#6FA2FF` / `#FFA94D` (soft `#123A45` / `#1B2D55` / `#3A2A1C`) |
| art halo | `#EAF0FF`: a 2 px rim around characters on dark, so the navy outline never sinks |

### Sections (art colour is the same in both themes; text and pills change)
| Section | Desk-mate | Art | Light tint / pill / text | Dark tint / pill / text |
| --- | --- | --- | --- | --- |
| Home | Lumen | `#4C6EF5` | `#C9D4FF` / `#E3E9FF` / `#1F3A93` | `#33438F` / `#1E2C66` / `#8DA6FF` |
| Library | Stacks | `#FFC233` | `#FFE29A` / `#FFF1C7` / `#865C00` | `#6E5A22` / `#3A3218` / `#FFC94D` |
| Modules | Binder | `#2DB87D` | `#B9EBD2` / `#DDF5E9` / `#15744A` | `#1E5C45` / `#15382C` / `#5BD49A` |
| Notebook | Jot | `#7B61FF` | `#D9D0FF` / `#ECE7FF` / `#5B3FD9` | `#433889` / `#2A2560` / `#AD9DFF` |
| Forum | Pip and Pod | `#F25CA2` | `#FFC7E1` / `#FFE3F0` / `#B0246B` | `#6E2D55` / `#42213A` / `#FF8CC6` |
| Calendar | Blink | `#F0524B` | `#FFCBC6` / `#FFE4E1` / `#C2332B` | `#6E3036` / `#42222A` / `#FF8A80` |
| Search | Loupe | `#8E9BB8` | `#D5DCEA` / `#E6EBF4` / `#4A5878` | `#3A4870` / `#24304F` / `#AAB8D6` |
| Tools (Boards, Grades, Career Navigator, Newsletter, Daily puzzles) | none | `#4C6EF5` | as Home | as Home |

The tools share the brand blue on purpose. They are secondary, and seven loud colours in one sidebar would
compete with the core five. Their shapes do the differentiating.

Art palette shared by all characters: outline `#14234D`, paper `#FFFFFF`, paper shade `#DCE6F5`, paper lines
`#C9D5EA`, metal `#9AA8C4` / `#DCE3F0`, cheeks `#FF8FA3`, sparkles `#FFC233`, "z" `#5F6F92`.

### Contrast (WCAG 2.x, every text pair used; computed by `tools/pairs.py`)

| Text | On: ratio |
| --- | --- |
| ink #0A1F44 | canvas #F2F5FB: **14.88** · surface #FFFFFF: **16.25** · inset #ECF1F9: **14.33** |
| ink-2 #3E4E6E | canvas #F2F5FB: **7.63** · surface #FFFFFF: **8.33** · inset #ECF1F9: **7.35** |
| ink-3 #5A6A8C | canvas #F2F5FB: **4.96** · surface #FFFFFF: **5.42** · inset #ECF1F9: **4.78** |
| accent #2445C2 | canvas #F2F5FB: **7.11** · surface #FFFFFF: **7.76** |
| white #FFFFFF | accent #2445C2: **7.76** |
| accent-text #1F3A93 | surface #FFFFFF: **10.07** · accent-soft #E3E9FF: **8.33** |
| ink #0A1F44 | accent-soft #E3E9FF: **13.44** |
| ink-2 #3E4E6E | accent-soft #E3E9FF: **6.89** |
| success #18794A | surface #FFFFFF: **5.42** |
| warning #8F5A00 | surface #FFFFFF: **5.78** |
| error #C0262D | surface #FFFFFF: **5.90** |
| exam #C21D5C | surface #FFFFFF: **5.79** |
| white #FFFFFF | exam #C21D5C: **5.79** |
| Y1 #0A727C | surface #FFFFFF: **5.66** · inset #ECF1F9: **4.99** |
| Y2 #1A5FCC | surface #FFFFFF: **5.91** · inset #ECF1F9: **5.21** · Y2 soft #DCE8FF: **4.79** |
| Y3 #9A5209 | surface #FFFFFF: **5.86** · Y3 soft #FFE8D1: **4.94** |
| home #1F3A93 | surface #FFFFFF: **10.07** · home pill #E3E9FF: **8.33** |
| library #865C00 | surface #FFFFFF: **5.92** · library pill #FFF1C7: **5.26** |
| modules #15744A | surface #FFFFFF: **5.79** · modules pill #DDF5E9: **5.05** |
| notebook #5B3FD9 | surface #FFFFFF: **6.65** · notebook pill #ECE7FF: **5.52** |
| forum #B0246B | surface #FFFFFF: **6.34** · forum pill #FFE3F0: **5.29** |
| calendar #C2332B | surface #FFFFFF: **5.52** · calendar pill #FFE4E1: **4.59** |
| search #4A5878 | surface #FFFFFF: **7.10** · search pill #E6EBF4: **5.93** |
| ink #0A1F44 | library soft #FFF1C7: **14.44** · badge #FFC233: **10.07** |
| ink-2 #3E4E6E | library soft #FFF1C7: **7.41** |
| canvas #F2F5FB | Filters pill #0A1F44: **14.88** |
| D ink #EAF0FF | canvas #0B1530: **15.81** · surface #111E3E: **14.39** · inset #1A2B54: **12.13** |
| D ink-2 #A9B8D9 | canvas #0B1530: **9.06** · surface #111E3E: **8.24** · inset #1A2B54: **6.95** |
| D ink-3 #8798BE | canvas #0B1530: **6.24** · surface #111E3E: **5.68** |
| D accent #8DA6FF | canvas #0B1530: **7.76** · surface #111E3E: **7.06** · accent-soft #1E2C66: **5.62** |
| D on-accent #0B1530 | accent #8DA6FF: **7.76** |
| D success #5BD49A | surface #111E3E: **8.86** |
| D warning #FFC233 | surface #111E3E: **10.18** |
| D error #FF7A7A | surface #111E3E: **6.50** |
| D exam #FF7EB0 | surface #111E3E: **6.93** |
| D on-exam #0B1530 | exam #FF7EB0: **7.61** |
| D Y1 #3BC9DB | surface #111E3E: **8.26** |
| D Y2 #6FA2FF | surface #111E3E: **6.48** · Y2 soft #1B2D55: **5.34** |
| D Y3 #FFA94D | surface #111E3E: **8.63** · Y3 soft #3A2A1C: **7.22** |
| D home #8DA6FF | surface #111E3E: **7.06** · pill #1E2C66: **5.62** |
| D library #FFC94D | surface #111E3E: **10.72** · pill #3A3218: **8.31** |
| D modules #5BD49A | surface #111E3E: **8.86** · pill #15382C: **6.93** |
| D notebook #AD9DFF | surface #111E3E: **7.07** · pill #2A2560: **5.90** |
| D forum #FF8CC6 | surface #111E3E: **7.68** · pill #42213A: **6.50** |
| D calendar #FF8A80 | surface #111E3E: **7.19** · pill #42222A: **6.16** |
| D search #AAB8D6 | surface #111E3E: **8.24** · pill #24304F: **6.54** |
| D ink-2 #A9B8D9 | library soft #3A3218: **6.39** |
| D Filters text #0B1530 | pill #EAF0FF: **15.81** |
| Y1 text `#0A727C` / dark `#3BC9DB` | Y1 soft `#D7F4F7`: **4.90** / `#123A45`: **6.15** |

Every pair passes AA (4.5:1). Lines and art colours are not text. Wherever a section colour is text, the "text"
tone is used, never the art fill.

## Typography (Google Fonts)

- **Display: Bricolage Grotesque**, 750, optical size auto, tracking −0.025em. Page titles, greetings, card
  titles. It has Latin only, so IBM Plex Sans Arabic is next in the stack.
- **UI: Figtree** 400–800. **Mono: JetBrains Mono** for module codes and the exam timer.
- **Arabic: IBM Plex Sans Arabic** 400–700, with line height 1.75 for Arabic body text.

| Token | px / line | Weight | Face |
| --- | --- | --- | --- |
| display-xl | 44 / 48 | 750 | Bricolage |
| display | 34 / 40 | 750 | Bricolage |
| title (phone page title) | 28 / 34 | 750 | Bricolage |
| heading | 22 / 28 | 750 | Bricolage |
| subhead | 17 / 24 | 700 | Figtree |
| body / body-sm | 16 / 25, 14 / 21 | 400 | Figtree |
| nav item | 15 / 20 | 500, active 700 | Figtree |
| meta / tab label | 13 / 18, 12 / 16 | 500–800 | Figtree |
| overline | 12 / 16 caps +0.1em | 800 | Figtree |
| timer / code | 40 / 44, 13 / 18 | 700 / 500 | JetBrains Mono |

## Shape and line language

Cards are index cards: radius 18, a 1.5 px line, a soft shadow. Buttons have radius 13 and are at least 44 px.
The primary button is royal with a 3 px `#1F3A93` lip, which drops on press. Inputs have radius 14 and are 46–48
px tall. Chips are pills, 44 px on touch. The one dark pill is "Filters", with a yellow count. In-page tabs use a
3 px underline in the section colour. Document thumbnails carry a coloured top band: yellow for a past paper,
mint with a tick for an examiners' report, violet with a squiggle for a students' note.

## Navigation icons (`icons/*.svg`, sheet `nav-icons.svg`, render `renders/nav-icons-sheet.png`)

The icons are the characters without faces: each is a tiny drawing of the same object, so the sidebar and tab
bar teach the cast.

| Icon | Object |
| --- | --- |
| Home | Desk lamp (Lumen): base, angled arm, shade with the bulb showing |
| Modules | Ring binder with the label window and two divider tabs |
| Library | Top sheet with a dog-ear on two booklets |
| Notebook | Spiral notebook with its label, and the pencil beside it |
| Forum | Big bubble with a small bubble answering |
| Calendar | Tear-off page with rings and a dot for today |
| Boards | Pinboard with two pinned notes |
| Grades | Calculator with a screen and keys |
| Career Navigator | Compass |
| Newsletter | Folded newsletter with a picture block |
| Daily puzzles | Puzzle grid with filled cells |
| Search | Magnifier (Loupe) |
| More (tab bar) | Three filled dots |

**Rules:**
- 24 px grid, a 2 px safe margin, a 1.75 px stroke with round caps and joins, corner radii of 1–3 px.
- Duotone: a line in `ink-2`, the main body filled with the section **tint**, and the paper parts filled with
  the surface colour, so they occlude cleanly.
- **Active state:** the line turns navy `#14234D` (light) or `#EAF0FF` (dark) at 1.85 px. The body takes the
  section's full **art** colour. The icon sits on a pill in the section's pill colour, and the label turns
  bold in the section's text colour. The state changes in three ways (line, fill and container), so it never
  relies on colour alone.
- Sizes: 24 px in the tab bar and top bar; 20–22 px in the sidebar. Checked at actual size in both themes.
- Production: the standalone files use `currentColor` for lines and `--icon-fill` / `--icon-paper` CSS
  variables for the duotone. One `<Icon name>` component sets the variables from the section tokens.
- New icon: draw the object a student touches for the task. It has to read as that object at 20 px with no
  fill, and it uses one tinted body plus paper parts. No symbols, flags or logos.

## The desk-mates (`sections/*.svg`, states in `sections/states/`)

Family rules, unchanged from v1:
- 200×200 artboard, feet on y = 180, a ground shadow.
- A 5 px `#14234D` outline. Two oval eyes with a catch-light, cheeks and a small smile.
- One section colour, plus paper, plus at most one shared accent (yellow, metal or pink).
- One detail that is true to the product: Binder's tabs are the Year 1/2/3 colours; Blink's header dots mark
  today; Stacks' sheet is dog-eared; Pip carries a question mark; Lumen's light falls on the desk; Loupe's
  lens shows the face.
- States: **happy** has ^ ^ eyes, an open smile and two yellow sparkles. **Sleepy** has closed eyes, a small
  "o" and "z z". `tools/states.py` generates both from the idle file.
- On dark backgrounds the characters get the 2 px light halo.
- Sizes: 98–104 px in headers, 160 px in empty states, 56 px on the Home shelf, 40 px in toasts. The nav icons
  replace them below 32 px.

| Section | Idle (you are here) | Happy (it worked) | Sleepy (empty) |
| --- | --- | --- | --- |
| Library: Stacks | Library header | "Uploaded. It's in ST2133 · May 2019." / "Done in 2:51. Mark it?" | "No papers match ST2133 · 2014. Try another year or clear filters." |
| Modules: Binder (the cover takes the module's colour on its page) | Module header | Lesson done | "You haven't added modules yet. Pick your year to start." |
| Notebook: Jot | Notebook header, beside the pen tools | "Saved" | "No notes in EC2066 yet. Start one, or annotate a past paper." |
| Forum: Pip and Pod | Forum header; Home's "Replies to you" | "Posted" / "Marked as the answer" | "No questions in IS2184 yet. Ask the first one." |
| Calendar: Blink | Calendar header; Home's Up next | Event added | "Nothing this week. Add your own event." |
| Home: Lumen | Home greeting band | First visit of the day: the lamp is on | Home is never empty |
| Search: Loupe | ⌘K palette | Exact match jump | "Nothing for 'regresion'. Did you mean regression?" |

## Mini Noora

Her art is unchanged (`bust-neutral.png` and `idle.png`).
- **Launcher:** a 62 px circle on surface, with a 3 px royal ring (`#1F3A93`, or `#8DA6FF` on dark), a soft
  lavender backing (`#E6E0FA`, or `#2A2F5E` on dark) and a green online dot. On phones it sits bottom-right,
  above the tab bar; on laptops, bottom-right of the content. You can drag it, it snaps to the nearest edge and
  it remembers the spot.
- **Chat panel:** a 380 px sheet (full-height on phones) with her 40 px bust and her name in Bricolage. Her
  messages are cards on surface with a 3 px lavender rule; yours sit on accent-soft. Formulas use KaTeX.
  Suggested prompts come from where you are.
- The desk-mates never appear in the chat.

## Logo

The existing DSBA Hub lockup and app icon, used as they are:
- **Light:** `hub-lockup-horizontal.png` at a height of 21 px on phones and 27 px in the sidebar.
- **Dark:** the white version at the same sizes.
- **App icon:** `hub-icon.png`.
- Clear space: the height of the "H" all round.
- The programme's official DSBA logo, when it appears, sits to the left with a 1 px divider.
- No v2 file redraws, outlines or recolours the logo.

## Motion

1. **Blink:** the characters blink every 6–11 s at random, one at a time, only while visible.
2. **Happy hop:** the toast character switches to its happy state and hops 6 px (320 ms, ease-bounce) while
   the sparkles pop in.
3. **Nav arrive:** the pill slides to the new item (200 ms), and the icon's tint fills to the art colour from
   the bottom (160 ms).
4. **Time me:** the button lip drops on press. The progress bar turns warning-coloured at 10 minutes left and
   exam-coloured at 2.
5. **Noora drag:** a 6° tilt while dragging, then a spring to the nearest edge.

**Reduced motion:** no blinks, hops, tilts or slides. States cross-fade in 120 ms, and information such as the
timer still updates.

## Key screens

- **Home (`home-screen.svg`):**
  - The sidebar has the real lockup and the new icons. The core five come first, then a TOOLS group.
  - The greeting band is accent-soft, with Lumen and the desk shelf of five characters. Each shelf card shows a
    live count in its section's text colour.
  - Up next: a raspberry exam slip, "ST2134 Statistical Inference · Thu 23 Oct, 9:00", with Blink.
  - Carry on: ST2133 Zone A, 42:10 left, with Resume.
  - My modules: binder covers in each module's colour.
  - Also: New files, To-do, Replies to you with Pip and Pod, and Noora.
- **Library on a phone (`library-screen.svg`, dark `library-screen-dark.svg`):**
  - The lockup in the app bar, then a yellow-soft header with Stacks, then search with the Loupe icon.
  - Filters (2) and clearable chips.
  - Paper cards with Time me, the examiners' report, Zone B with the student's score, and Fatima's Year 3 note.
  - Noora's launcher, and the tab bar with the new icons (Library active).
- **Module page:** a header in the module's colour with its Binder cover; tabs Lessons · Papers · Notes ·
  Threads · Dates; empty tabs show the matching character, sleepy.
- **Notebook:** a ruled inset canvas, with Jot by the pen, highlighter and eraser tools (44 px). Saving shows
  Jot happy.
- **Forum:** Pip and Pod in the header; question cards with KaTeX. Accepted answers get a success rule. Arabic
  posts are right-aligned in IBM Plex Sans Arabic.

## Production plan

- **Characters and icons:** inline SVG React components. The characters take a `state` prop; the icons are one
  `<Icon>` with CSS variables. SVGO runs in the build.
- **Logo and app icon:** the existing PNGs. Ask for SVG masters of the existing logo if they exist; don't trace
  it.
- **Noora:** the existing PNGs.
- **Raster art:** optional only, for big empty-state scenes. Hero-sheet prompt: "Character model sheet on a
  plain cool white background (#F2F5FB). Seven cute but grown-up stationery characters for a university study
  app, flat vector, 5 px navy outline (#14234D), soft chunky rounded shapes, flat fills with one darker shade,
  small oval eyes with a white highlight, pink cheeks, tiny smile, stubby navy feet, soft ground shadow:
  1) a stack of yellow booklets with a white top sheet face and a paper clip;
  2) a mint-green ring binder with divider tabs in lagoon, sky and amber;
  3) a violet spiral notebook with a pink elastic band and a yellow pencil tail;
  4) a big pink speech bubble and a small white one with a question-mark tuft;
  5) a tear-off calendar page with a tomato-red header and binder-ring ears;
  6) a royal-blue desk lamp with the face on the shade and warm light below;
  7) a steel magnifying glass with a navy handle and the face in the lens.
  Each in idle, happy (closed happy eyes, sparkles) and sleepy (closed eyes, 'z'). No text, no logos, no
  people."
- **Libraries:** `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/figtree`,
  `@fontsource/jetbrains-mono` and `@fontsource/ibm-plex-sans-arabic`. KaTeX is already used. Nothing else.

## Files

- `direction.md`, `tokens.json`
- `sections/{home,library,modules,notebook,forum,calendar,search}.svg`; `sections/states/*-{happy,sleepy}.svg`
- `icons/*.svg` (13), `nav-icons.svg`
- `library-screen.svg`, `library-screen-dark.svg`, `home-screen.svg`
- `renders/`: `nav-icons-sheet.png`, `characters-sheet.png` (200/48/24 px, light and dark), `states-sheet.png`
  (light and dark), `home-screen.png`, `library-screen.png`, `library-screen-dark.png`
- `tools/`: generators (icons, screens, states, recolour), the contrast checker, the render script
