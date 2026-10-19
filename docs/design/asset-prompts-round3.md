# Asset prompts, round 3: Daily's game art

Six pictures, one per Daily game, for the tiles on `/daily`. Rounds 1 and 2 are `asset-prompts.md` and
`asset-prompts-round2.md`; their generator settings and palette hold here too. Drop finished files in
`web/public/brand/incoming/` under the names given; they then move to `web/public/daily/` and take the place of the
drawn glyph in each tile's art slot (`web/src/features/daily/components/GameCard.tsx`). Until they arrive, the tiles
keep the shapes drawn in code (`GameGlyph.tsx`). A finished play's tile shows the play's own squares instead of either.

**Canvas.** 1024×1024 transparent PNG, 1:1, the drawing centred and filling about 80% of the canvas, nothing touching
the edges. The tile shows it at 56 px on phones and 96 px on laptops, so shapes must read at 56 px: few, large pieces,
no fine detail. Ask for a **transparent background**; if the model can't, ask for plain white `#FFFFFF` (never a
checkerboard) and we cut it out.

**Shared style (Mini Noora's).** Clean modern editorial vector, smooth shapes, thin dark-navy `#0A1F44` outlines, flat
colour with one soft shade tone per colour, no gradients, no texture, no 3D, no gloss or shine. No letters, digits or
words anywhere (models garble them; the game's name sits under the art). No logos, and nothing that imitates another
puzzle app's look. Each picture leads with its game's own colour from the hub, so the six tell apart at a glance; the
tile's tint behind it is that colour at 13%.

Make **6a first**, keep its seed (or attach it as the style reference) and reuse it for the other five.

**6a. The Word.** File: `daily-word.png`. Colour: signal green `#12B886`.

```text
Flat vector illustration, transparent background, centred, filling 80% of a square canvas. Two rows of five rounded
square tiles, slightly tilted as if just laid on a table, the upper row with tiles filled in green #12B886, yellow
#FFE14A and soft grey #8A9BB8, the lower row empty with outlined edges; a small pencil leaning against the right end.
Clean modern editorial vector, thin dark-navy #0A1F44 outlines, flat colour with one soft shade tone per colour, no
gradients, no texture, no 3D, no gloss. No letters, no digits, no text, no logos.
```

**6b. Correlations.** File: `daily-groups.png`. Colour: violet `#6741D9`.

```text
Flat vector illustration, transparent background, centred, filling 80% of a square canvas. Sixteen small rounded
cards in a loose four-by-four arrangement; four of them slide together into a neat row and glow softly in violet
#6741D9, the rest are pale cream #F4F7FC with a hint of yellow #FFE14A, green #12B886 and blue #1F6FEB edges. A thin
curved arrow shows the four cards joining. Clean modern editorial vector, thin dark-navy #0A1F44 outlines, flat colour
with one soft shade tone per colour, no gradients, no texture, no 3D, no gloss. No letters, no digits, no text, no
logos.
```

**6c. Data Mine.** File: `daily-search.png`. Colour: amber `#F08C00`.

```text
Flat vector illustration, transparent background, centred, filling 80% of a square canvas. A square grid of small
round dots, like a field of hidden letters, with one bold amber #F08C00 highlighter stroke running diagonally through
a line of dots; a small miner's pickaxe rests on the lower right corner of the grid, its head catching the same
amber. Clean modern editorial vector, thin dark-navy #0A1F44 outlines, flat colour with one soft shade tone per
colour, no gradients, no texture, no 3D, no gloss. No letters, no digits, no text, no logos.
```

**6d. The Daily Query.** File: `daily-quiz.png`. Colour: cobalt `#1558F0`.

```text
Flat vector illustration, transparent background, centred, filling 80% of a square canvas. A speech-bubble-shaped
card in cobalt blue #1558F0 with a large rounded question-mark shape cut out of it (a shape, not a typed character),
and beneath it three stacked pill-shaped answer buttons, the middle one filled green #12B886 with a white tick. Clean
modern editorial vector, thin dark-navy #0A1F44 outlines, flat colour with one soft shade tone per colour, no
gradients, no texture, no 3D, no gloss. No letters, no digits, no text, no logos.
```

**6e. Nearest Neighbour.** File: `daily-nearest.png`. Colour: rose `#C2255C`.

```text
Flat vector illustration, transparent background, centred, filling 80% of a square canvas. A scatter of small round
points on a plain field, with dashed rings spreading out from one central point like ripples; the central point is a
bright yellow #FFE14A target, the nearest point to it is rose #C2255C and joined to it by a short solid line, the
farther points fade to pale grey-blue. Clean modern editorial vector, thin dark-navy #0A1F44 outlines, flat colour
with one soft shade tone per colour, no gradients, no texture, no 3D, no gloss. No letters, no digits, no text, no
logos.
```

**6f. Sudoku.** File: `daily-sudoku.png`. Colour: lagoon `#0FA3B1`.

```text
Flat vector illustration, transparent background, centred, filling 80% of a square canvas. A square board divided into
a three-by-three grid of boxes with bold lagoon-teal #0FA3B1 borders and thinner inner lines; a few cells filled with
small solid dots in navy instead of numbers, one cell highlighted in yellow #FFE14A, and a small pencil resting
diagonally across the lower right corner. Clean modern editorial vector, thin dark-navy #0A1F44 outlines, flat colour
with one soft shade tone per colour, no gradients, no texture, no 3D, no gloss. No letters, no digits, no text, no
logos.
```

**Checks before they go in.** Real transparency (an RGBA file, no painted checkerboard); readable at 56 px; the six
side by side look like one set; no text or digits crept in.
