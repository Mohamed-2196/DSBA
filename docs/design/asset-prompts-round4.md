# Asset prompts, round 4: the study core

Updated: 2026-10-19

**Task.** Spot illustrations for the empty and blocked moments students hit most often in the library, modules and
lessons, the forum, the notebook and the personal features. On these screens a student is told nothing is there.
The art makes that moment read at a glance and points toward the next step.

The core screens don't need heroes, mascots or section banners. They are working screens, so the art stays in empty
states.

**Capability gap.** The coding tools can't generate images. Generate these with an image model, check them against the
acceptance list, and drop them in `web/public/brand/incoming/`. None of the new files exist yet. A builder wires them
in once Mohamed picks.

**Earlier rounds.** `asset-prompts.md` (brand, module icons, the first empty states), `asset-prompts-round2.md` and
`asset-prompts-round3.md` (Daily). Candidates from the other session, with their exact prompts, are in
`generated/2026-10-19/CATALOGUE.md`.

## What the core sections have today

| Moment | How often students meet it | Art today |
| --- | --- | --- |
| Nothing due (Home, calendar) | Often | `empty-nothing-due.png` |
| No notes or files yet (library, notebook) | Often | `empty-no-notes.png` |
| No search results (library, notebook, forum search, ⌘K) | Often | `empty-search.png` |
| Offline or the server can't be reached | Sometimes | `empty-offline.png` |
| A forum or module discussion with no threads | Often: most module boards are quiet | An icon. The F1 candidate `empty-board.png` is waiting for selection. |
| A module with no video lessons yet (`ModulePage.tsx`), or nothing in progress (`ContinueLearning.tsx`) | Very often: IS2184 and every Year 3 module have no lessons | An icon only. **Gap C1.** |
| A guest opens a personal feature: starred files, my uploads, the notebook, boards (`LibraryPage.tsx`, `auth/Gate.tsx`) | Every guest | An icon only. **Gap C2.** |
| A file, thread, module or note that doesn't exist, or a dead link (`FileViewerPage.tsx`, `ThreadPage.tsx`, `ModulePage.tsx`, `NotePage.tsx`, `RouteErrorBoundary.tsx`) | Sometimes, from old shared links | An icon only. **Gap C3.** |

The newsletter has its cover (`brand/newsletter-cover.jpg`) and modules have their 16 icons. Career and the grades
calculator are text and figures, and art wouldn't help there.

## Shared art direction

**Match the four illustrations already in the app.** That means `empty-search.png` and `empty-nothing-due.png` most
closely:

- a small calm scene of two or three chunky rounded objects;
- no outlines;
- saturated flat fills, each with one darker shade tone;
- one short soft highlight on the larger shapes;
- light from the top left.

An earlier preamble in `asset-prompts-round2.md` says "no glossy streaks", but the approved art has a soft highlight,
so follow the art.

**References to attach:**

| File | Use it for |
| --- | --- |
| `web/public/illustrations/empty-search.png` | The main style reference: weight, highlight, palette and spacing. |
| `web/public/illustrations/empty-nothing-due.png` | A second reference for a scene of three objects. |

**Palette.**

- Cobalt `#1558F0` (actions), royal blue `#1F3A93`, lagoon `#0FA3B1` (Year 1), amber `#F08C00` (Year 3) and soft
  yellow `#FFE14A`.
- White and pale blue `#EAF0F9` for paper.
- Navy `#0A1F44` only as a small fill.

**How it's shown.** `EmptyState` shows the art at 168 px wide (120 px in small states), over a soft cobalt disc that
works in both themes. So:

- every object must read at 120 px;
- the white parts may rely on the disc;
- nothing may rely on a dark outline.

**Constraints.**
- No letters, digits, words, play-button logos, brand marks or anything that reads as a real app or platform's logo.
  That includes YouTube's red play button, Google Drive's triangle and the WhatsApp bubble.
- No people. The hub's only character is Mini Noora, and she isn't redrawn.
- No motion lines or sparkle bursts beyond the small ones in `empty-search.png`.

## Requests

| ID | Priority | Screen and role | Planned output | Status |
| --- | --- | --- | --- | --- |
| F1 | Required | Forum and a module's discussion, no threads yet | `web/public/brand/incoming/empty-board.png` | generated, inspected; waiting for Mohamed |
| C1 | Required | A module with no video lessons; nothing in progress | `web/public/brand/incoming/empty-no-lessons.png` | requested |
| C2 | Required | A guest opening a personal feature | `web/public/brand/incoming/empty-sign-in.png` | requested |
| C3 | Optional | A file, thread, module or note that isn't there | `web/public/brand/incoming/empty-not-found.png` | requested |

C1, C2 and C3 share these settings:

- **Production:** a new image, not an edit.
- **Size:** 800×600 (4:3), with the scene centred and filling about 80% of the frame.
- **Background:** real transparent alpha (RGBA). If the model can't do that, use a plain `#FF00FF` magenta that fills
  the frame and is cut out afterwards, with no magenta anywhere in the subject and never a painted checkerboard.
- **Text:** none.
- **Variants:** none. The disc behind the art handles dark mode.

### C1. No lessons yet

Purpose: a module page whose lessons haven't been added yet. It should say "nothing to watch here yet", calmly, not
"broken".

```text
Spot illustration on a transparent background, 4:3, centred, filling 80% of the frame. A small calm scene: a rounded
cobalt #1558F0 video screen on a short stand, its pale blue #EAF0F9 screen blank with a soft rounded triangle play
shape in white (a plain triangle, not any platform's logo); in front of it an open notebook with blank pale blue lines
and a soft yellow #FFE14A pencil lying across it; a small lagoon #0FA3B1 bookmark ribbon hanging from the notebook.
Style matching the attached reference: chunky rounded objects, no outlines, saturated flat fills each with one darker
shade tone, one short soft highlight on the larger shapes, light from the top left, clear gaps between objects, reads
at 120 px. No people, no letters, no digits, no text, no logos, no motion lines.
```

### C2. Sign in to keep your own things

Purpose: a guest who taps Starred, My uploads, the notebook or a board. It should say "this part is yours once you
sign in", and feel welcoming, not locked out. A padlock reads as "forbidden", so the scene uses a key and a personal
folder instead.

```text
Spot illustration on a transparent background, 4:3, centred, filling 80% of the frame. A small calm scene: a rounded
royal blue #1F3A93 folder standing slightly open, with a pale blue #EAF0F9 page and a soft yellow #FFE14A star-shaped
bookmark peeking out of it; leaning against the folder, a chunky rounded amber #F08C00 key with a round bow. Nothing
locked, no padlock. Style matching the attached reference: chunky rounded objects, no outlines, saturated flat fills
each with one darker shade tone, one short soft highlight on the larger shapes, light from the top left, clear gaps
between objects, reads at 120 px. No people, no letters, no digits, no text, no logos, no motion lines.
```

### C3. Not here

Purpose: an old link to a file, thread, module or note that has gone. It should say "that page isn't here" and point
back. It's optional, because these moments are rarer.

```text
Spot illustration on a transparent background, 4:3, centred, filling 80% of the frame. A small calm scene: an empty
cobalt #1558F0 file tray with a single pale blue #EAF0F9 sheet lying beside it, slightly curled; a lagoon #0FA3B1
signpost with one rounded arrow-shaped board pointing to the left, blank with no writing. Style matching the attached
reference: chunky rounded objects, no outlines, saturated flat fills each with one darker shade tone, one short soft
highlight on the larger shapes, light from the top left, clear gaps between objects, reads at 120 px. No people, no
letters, no digits, no text, no logos, no motion lines.
```

## Acceptance, for each file

- The file is a real RGBA PNG at 800×600, with a clean edge and no magenta or white halo.
- At 120 px on the cobalt disc, over both `#FFFFFF` and `#0D1B3B`, the subject is recognisable and no piece disappears.
- No letters, digits, logos or anything that reads as another platform's mark.
- It sits beside `empty-search.png` and `empty-nothing-due.png` as one set.

## Return contract for the image model

Generate each file and look at it before saving. Keep the exact prompt and the native output, and add both to a dated
`docs/design/generated/` catalogue as the 2026-10-19 batch did. Report each file's path, size and any problems.

Don't approve, wire in or overwrite anything.

## Integration, once Mohamed picks

These are code-only changes for a builder. Some of them need no new art.

- **Shared component:** add `'forum' | 'no-lessons' | 'sign-in' | 'not-found'` to `EmptyIllustration` in
  `web/src/ui/EmptyState.tsx`.
- **Move the files** to `web/public/illustrations/`, renaming F1 to `empty-forum.png` so it isn't confused with the
  study boards.
- **Optimise:** the existing four are already 19–29 kB. Compress the new ones to match, under 30 kB each, keeping
  800×600 so `EmptyState`'s `width`/`height` stay right.
- **Wire in the new art:**
  - `empty-forum`: ForumPage's no-threads state and `ModuleThreads.tsx`.
  - `empty-no-lessons`: ModulePage's "No video lessons" state and ContinueLearning's "Nothing in progress".
  - `empty-sign-in`: LibraryPage's signed-out Starred and Uploads, and the notebook and board gates in
    `auth/Gate.tsx`.
  - `empty-not-found`: the not-found states listed in the table above, and the route error boundary's 404.
- **Existing art, no new files:**
  - `ModuleFiles.tsx` "No files for X yet" and Home's `NewFiles.tsx` take `empty-no-notes`.
  - LibraryPage's "No starred files yet" stays an icon, because it's a small inline state.
- **Check** each screen at 360, 390 and 1440 px in light and dark, then mark each request `integrated` here.
