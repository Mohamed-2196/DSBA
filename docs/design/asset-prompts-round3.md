# Asset prompts, round 3: Daily's game art

Updated: 2026-10-19

**Task.** Six pictures, one per Daily game, for the tiles on `/daily`. Each tile shows its game's art on the game's own
tint above the name, so a student tells the six games apart at a glance. If a file can't load, the tile shows the
shape drawn in code (`web/src/features/daily/components/GameGlyph.tsx`). A finished play's tile shows the play's own
squares instead of either.

**Capability gap.** The coding tools can't generate images. Mohamed makes these with an image model and drops them
in `web/public/brand/incoming/`. A builder then moves them to `web/public/daily/` and wires them into the tile's art slot
(`GameCard.tsx`, `.dh-tile__art` in `DailyPage.css`). All six are in: exported at 192×192 WebP (4 to 9 kB each) in
`web/public/daily/`, and checked on `/daily` at 360, 390, 844 (sideways), 768, 1440 and 2560 px in both themes. The AI-generated
originals, exact prompts and inspection notes are in `generated/2026-10-19/CATALOGUE.md`.

**Earlier rounds.** `asset-prompts.md` (brand, module icons, empty states) and `asset-prompts-round2.md`.

## Shared art direction

**Match the module icons, not Mini Noora.** These are small object icons. The closest finished art in the app is the
module icons, so their look is the reference:

- chunky rounded shapes with **no outlines**;
- saturated flat colour with one darker shade tone per colour;
- a single short white highlight streak on the larger pieces.

Mini Noora is a character with dark outlines and suits people, not icons.

**References to attach** (as style references, never as things to copy into the picture):

| File | Use it for |
| --- | --- |
| `web/public/modules/module-st2187.png` | The main reference: shape weight, the highlight streak, no outlines, and how the art reads small. |
| `web/public/illustrations/empty-search.png` | Palette and finish of the hub's larger illustrations. |

**Palette.** Each picture leads with its game's colour, taken from `web/src/styles/tokens.css`:

| Game | Token | Colour |
| --- | --- | --- |
| The Word | `--signal` | green `#12B886` |
| Correlations | `--mine-violet` | violet `#6741D9` |
| Data Mine | `--y3` | amber `#F08C00` |
| The Daily Query | `--cobalt` | cobalt `#1558F0` |
| Nearest Neighbour | `--mine-rose` | rose `#C2255C` |
| Sudoku | `--y1` | lagoon `#0FA3B1` |

Supporting colours are cream `#F4F7FC`, yellow `#FFE14A` and navy `#0A1F44`, used only as a fill for small pieces.

**Backgrounds the art must work on.** The tile behind the picture is the game's colour at 13% over the page:

- light theme: near-white over `#FFFFFF`;
- dark theme: very dark over `#0D1B3B`.

So no piece may rely on a navy or black edge to be seen: on the dark tile it vanishes. Every shape's silhouette must
come from its fill.

**Size.** The tile shows the art at **96 px** on laptops and **50 px** on phones. Few, large pieces and no fine detail.
Three to five shapes at most.

**Constraints.**
- No letters, digits or words anywhere, because models garble them and the game's name sits under the art. A question
  mark is drawn as a shape, not a typed character.
- No logos.
- Nothing that recreates another puzzle app's signature look. In particular: no row of five green, yellow and grey
  letter tiles, and no four-by-four grid in yellow, green, blue and purple.

**Continuity.** Same light direction (top left), same highlight streak, same shape weight and the same 80% fill in all
six. Make **D1 first**, then attach it as a style reference (or reuse its seed) for the other five.

## Requests

| ID | Priority | Screen and role | Planned output | Status |
| --- | --- | --- | --- | --- |
| D1 | Required | `/daily` tile, The Word | `web/public/daily/word.webp` | integrated |
| D2 | Required | `/daily` tile, Correlations | `web/public/daily/groups.webp` | integrated |
| D3 | Required | `/daily` tile, Data Mine | `web/public/daily/search.webp` | integrated |
| D4 | Required | `/daily` tile, The Daily Query | `web/public/daily/quiz.webp` | integrated |
| D5 | Required | `/daily` tile, Nearest Neighbour | `web/public/daily/nearest.webp` | integrated |
| D6 | Required | `/daily` tile, Sudoku | `web/public/daily/sudoku.webp` | integrated |

All six requests share the same settings:

- **Production:** a new image, not an edit of an existing one.
- **Size:** 1024×1024, square, with the drawing centred and filling about 80% of the canvas and nothing touching the
  edges.
- **Background:** real transparent alpha (RGBA). If the model can't do that, use plain white `#FFFFFF`, never a painted
  checkerboard, and the builder cuts it out.
- **Text:** none.
- **Variants:** none. One file works on both themes.

### D1. The Word: guessing one hidden word

Composition: three chunky rounded square tiles standing in a slight arc, blank faces. The front tile is green and
carries a soft white tick shape. A short pencil leans against the right tile.

```text
Chunky rounded vector icon on a transparent background, centred, filling 80% of a square canvas. Three blank rounded
square tiles standing in a gentle arc, the front tile in green #12B886 with a soft white tick shape on it, the two
behind it in pale cream #F4F7FC with green shade edges; a short yellow #FFE14A pencil leans against the right tile.
Style: no outlines, saturated flat colour with one darker shade tone per colour, a single short white highlight streak
on the larger shapes, light from the top left, few large shapes that read at 50 px. No letters, no digits, no text, no
logos.
```

### D2. Correlations: finding the groups that belong together

Composition: four rounded cards snapping into one row, joined by a short violet band. Two loose cards drift outside
the row. Everything is violet and cream, with no four-colour grid.

```text
Chunky rounded vector icon on a transparent background, centred, filling 80% of a square canvas. Four blank rounded
cards snapping together into one neat row, joined by a short violet #6741D9 band across their middles, the four cards
in violet with lighter violet shade edges; two loose pale cream #F4F7FC cards drift just above and below the row,
slightly tilted. Style: no outlines, saturated flat colour with one darker shade tone per colour, a single short white
highlight streak on the larger shapes, light from the top left, few large shapes that read at 50 px. No letters, no
digits, no text, no logos.
```

### D3. Data Mine: hunting words in a grid

Composition: a small square of round stones, a diagonal line of them lit amber. A pickaxe rests at the lower right,
with an amber head.

```text
Chunky rounded vector icon on a transparent background, centred, filling 80% of a square canvas. A small square grid of
four by four round cream #F4F7FC stones, with one diagonal line of four stones glowing amber #F08C00; a chunky pickaxe
with an amber head and a navy #0A1F44 handle rests across the lower right corner of the grid. Style: no outlines,
saturated flat colour with one darker shade tone per colour, a single short white highlight streak on the larger
shapes, light from the top left, few large shapes that read at 50 px. No letters, no digits, no text, no logos.
```

### D4. The Daily Query: a short quiz

Composition: a cobalt speech bubble with a question-mark shape cut out. Under it are three answer pills, the middle one
green with a tick.

```text
Chunky rounded vector icon on a transparent background, centred, filling 80% of a square canvas. A cobalt blue #1558F0
speech bubble with a large rounded question-mark shape cut out of it (a cut-out shape, not a typed character); beneath
it three stacked pill-shaped answer buttons, the top and bottom in pale cream #F4F7FC, the middle one green #12B886
with a white tick. Style: no outlines, saturated flat colour with one darker shade tone per colour, a single short
white highlight streak on the larger shapes, light from the top left, few large shapes that read at 50 px. No letters,
no digits, no text, no logos.
```

### D5. Nearest Neighbour: getting closer to the hidden word

Composition: a yellow target at the centre with two soft rose rings around it. A rose point sits just inside the inner
ring, and two pale points sit farther out.

```text
Chunky rounded vector icon on a transparent background, centred, filling 80% of a square canvas. A round yellow #FFE14A
target point at the centre, with two soft filled rings around it in light rose; one solid rose #C2255C point sits just
inside the inner ring, close to the target, and two smaller pale cream #F4F7FC points sit farther out. The rings are
filled soft bands, not thin lines. Style: no outlines, saturated flat colour with one darker shade tone per colour, a
single short white highlight streak on the larger shapes, light from the top left, few large shapes that read at
50 px. No letters, no digits, no text, no logos.
```

### D6. Sudoku: filling the grid

Composition: a thick lagoon board in three-by-three blocks, a few cells holding navy dots, one cell yellow. A pencil
lies across the lower right corner.

```text
Chunky rounded vector icon on a transparent background, centred, filling 80% of a square canvas. A thick rounded square
board in lagoon teal #0FA3B1, divided into a three-by-three grid of pale cream #F4F7FC blocks by bold teal gaps; four
blocks hold one solid navy #0A1F44 dot each instead of numbers, and one block is filled yellow #FFE14A; a short pencil
lies diagonally across the lower right corner. Style: no outlines, saturated flat colour with one darker shade tone
per colour, a single short white highlight streak on the larger shapes, light from the top left, few large shapes that
read at 50 px. No letters, no digits, no text, no logos.
```

## Acceptance, for each file

- The file is a real RGBA PNG at 1024×1024, with a clean edge and no white halo.
- At 50 px on the light tile and on the dark tile (`#0D1B3B` with 13% of the game's colour), the subject is
  recognisable and no piece disappears.
- No letters, digits or text have crept in, and no other app's look is recreated.
- The six side by side look like one set: the same shape weight, highlight and fill.
- They also sit comfortably beside `module-st2187.png`.

## Return contract for the image model

Generate each file and look at it before saving. Keep the exact prompt used and any seed. Report each file's path,
size, and any problem you saw.

Don't approve, wire in or overwrite anything. Mohamed picks, and a builder integrates.

## Integration, once Mohamed picks

- Move the files from `web/public/brand/incoming/` to `web/public/daily/`. Export them at 192×192 (2× the laptop size)
  as WebP or optimised PNG, aiming for under 20 kB each.
- In `GameCard.tsx`, render an `<img>` with `alt=""` (the art slot is `aria-hidden`; the game's name follows it) and
  fixed width and height of `var(--art)`, so nothing shifts. Keep `GameGlyph` for a missing file.
- `/daily` is the first screen of the hub, so load the images normally, not lazily.
- Check `/daily` at 360, 390 and 1440 px in light and dark, then mark each request `integrated` here.
