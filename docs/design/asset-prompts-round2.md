# Asset prompts, round 2

Second round of prompts for the artwork that didn't pass review. Round 1 is `asset-prompts.md`. Each section keeps
its set's shared style; drop finished files in `web/public/brand/incoming/` under the names given.

## Brand

**What happened in round 1.** The lockup and the icon now ship:

- **Lockup:** composed by hand from the official `dsba-logo.png`, left untouched, plus "Hub" traced in matching heavy
  type and cut by the same sweeping stripes (`web/public/brand/hub-lockup-horizontal*.png`).
- **Icon:** "Minimalist DH Wave Logo", cleaned and recoloured to the logo's blue (`hub-icon-*.png`).

None of the generated wordmarks could be used, for these reasons:

| File | Verdict |
| --- | --- |
| DSBA Hub Sweeping Blue Wordmark | Redraws "DSBA": the stripes are hairline cuts instead of the logo's broad bands, and the cuts are dashed and noisy. |
| DSBA Hub Sweeping Blue Wordmark (1) | The same faults, stacked. |
| DSBA Hub Sweeping Stripe Logo | A fake transparency checkerboard is baked into the pixels, and "DSBA" is redrawn. |
| DSBA Hub Swoosh Wordmark | White letters on black with blotchy artefacts all over, and "DSBA" is redrawn. |
| Dynamic Blue DH Monogram | Close to the kept icon, but the mark runs nearer the edges, so it crops badly as a maskable icon. |

**Shared rule for this set.** An image model can't copy a logo exactly, so never ask it to draw "DSBA". Ask only for
the new word and compose it with the official file. Ask for a plain white background, not "transparent": models
paint a checkerboard instead of real transparency. The white is removed afterwards.

**2a. "Hub" alone, to compose with the official logo.** Optional: it would replace the traced "Hub" if it comes out
better. Attach `web/public/brand/dsba-logo.png` as the style reference. 2400×800 PNG. File: `hub-word.png`.

```text
Flat vector lettering of the single word "Hub" ("H" uppercase, "ub" lowercase) on a plain pure-white #FFFFFF
background, centred, nothing else in the image. Match the attached logo's lettering exactly: very heavy, wide
grotesque sans-serif (Arial Black weight), flat terminals, tight counters, the same stroke weight. Cap height of "H"
about 50% of the image height. Two broad white bands sweep through the letters like the attached logo's stripes: each
band about 5% of the cap height thick, the upper one entering just below the "H" crossbar, both arcing gently up and
then down to the right, never touching a letter edge at a tangent. Letters in one solid colour #143690. No outline,
no gradient, no texture, no noise, no shadow, no checkerboard, no other text or marks. Crisp, clean edges for vector
tracing.
```

## Module icons

**Kept (9, in `web/public/modules/`):** EC1002, MN1178, MT1186, ST1215, ST2133, ST2134, ST2195, ST2187, EC2020.
They share one look: flat fills, thick rounded navy axes, blue, teal, amber and yellow, almost no highlights.

**Rejected (7):**

| File | Why |
| --- | --- |
| `module-is2184.png` | Isometric 3D server boxes and glossy spheres with shine spots; reads as a different set. |
| `module-machine-learning.png` | Glossy 3D balls for nodes; a fake checkerboard was painted in instead of transparency. |
| `module-market-research.png` | Glossy, bevelled pie chart; fake checkerboard background. |
| `module-microeconomics.png` | Glossy, shaded scale and coins; fake checkerboard background. |
| `module-asset-pricing.png` | Glossy bevelled shield with shine; fake checkerboard background. |
| `module-marketing-management.png` | Glossy 3D megaphone and bag with heavy shading; fake checkerboard background. |
| `module-further-maths.png` | Gradient-filled wireframe, the only one with gradients; fake checkerboard background. |

Six of the seven came back with a grey-and-white checkerboard drawn into the pixels (an RGB file, not a transparent
one). If the tool can't export real transparency, ask for a plain white background instead; we cut that out.

**How to make them:** pass `web/public/modules/module-ec1002.png` and `module-st2133.png` as the style reference for
every prompt. Paste the preamble, then one subject line, as one prompt. 512×512 is fine; we trim and pad.

**Preamble (paste first, every time):**

```text
Flat vector icon, 1:1, on a real transparent background (or plain pure white #FFFFFF if transparency isn't
possible). Never draw a checkerboard or any pattern behind the subject. One simple symbolic object, centred,
filling about 80% of the frame, matching the reference icons exactly in style: modern editorial flat
illustration, geometric shapes, soft rounded corners, thick rounded strokes in deep navy #0C2D75 where lines are
needed, solid flat fills only, chosen from royal blue #1F3A93, cobalt #1558F0, lagoon #0FA3B1, amber #F08C00 and
soft yellow #FFE14A, with white #FFFFFF for small details. Seen straight on, never isometric or in perspective.
No gradients, no glossy highlights or shine spots, no spheres or balls, no bevels, no drop shadows, no texture,
no 3D, no photorealism. Absolutely no text, letters, numbers or logos. Calm, grown-up, university feel; it must
sit in a set of 16 matching icons next to the references. Subject:
```

**Subjects:**

| File | Module | Subject line |
| --- | --- | --- |
| `module-is2184.png` | Information Systems Management | Three flat rounded rectangles stacked as a server rack, seen straight on, each with one small white dot and two short bars; a thin navy line drops from the rack to three flat circles in a row joined by lines. |
| `module-machine-learning.png` | Machine Learning | A simple neural network seen flat: three columns of plain flat circles (three, four, one) joined by thin navy lines, the single output circle in amber, the others in blue and lagoon. |
| `module-market-research.png` | Statistical Methods for Market Research | A flat clipboard with three rows, each a small amber tick box and two short bars, and beside it a flat pie chart cut into three slices. |
| `module-microeconomics.png` | Microeconomics | A flat balance scale drawn with thick rounded navy strokes, a simple flat house shape on the left pan and a short stack of flat amber coins on the right pan, level with each other. |
| `module-asset-pricing.png` | Principles of Asset Pricing | Five flat candlesticks on a pair of navy axes, trending upward from left to right, with a plain flat shield shape in light blue behind the right-hand candles. |
| `module-marketing-management.png` | Marketing Management | A flat megaphone in side view pointing right with three short amber sound arcs, and a small flat yellow shopping bag below it. |
| `module-further-maths.png` | Further Mathematics for Economists | A curved surface drawn as a wireframe grid of evenly spaced cobalt lines on flat blue, rising to a single peak marked by a small amber dot, on two navy axes. |

## Illustrations

**What went wrong in round 1, for the whole set.** Every image painted a grey checkerboard where the transparency
should be, so the backdrop had to be cut out by hand. The style also drifted from flat to glossy: white highlight
streaks, soft 3D shading and bevelled edges. The four that were kept (nothing due, no notes, offline, search) still
read well at 120 px, so the new prompts only need to match them, not restart the set.

**Preamble (paste first, every time; attach `web/public/illustrations/empty-search.png` as the style reference):**

```text
Flat vector spot illustration, 4:3, on a plain solid #FF00FF magenta background that fills the whole frame (it is cut
out afterwards, so never draw a checkerboard or any pattern behind the subject, and use no magenta in the subject).
One small calm scene of two or three objects, centred, filling about 80% of the frame, with clear gaps between the
objects. Style: modern editorial flat illustration matching the attached reference, geometric shapes, soft rounded
corners, no outlines or very thin #0A1F44 outlines, flat colours chosen from: royal blue #1F3A93, cobalt #1558F0,
lagoon #0FA3B1, amber #F08C00, soft yellow #FFE14A, with white #FFFFFF and pale blue #EAF0F9 for paper and highlights.
At most one small flat highlight shape per object; no glossy streaks, no gradients, no bevels, no 3D, no texture, no
photorealism. No motion lines, sparks or "burst" strokes. Absolutely no text, letters, numbers, symbols that read as
letters, or logos. Calm, grown-up, university feel. Subject:
```

| File | Where | Why round 1 was rejected | Subject line |
| --- | --- | --- | --- |
| `empty-board.png` (800×600) | Forum board with no threads | Too loud for an empty state: two big glossy bubbles with burst lines, the left tail stabs into the board, and the board reads as a tray with four pins and nothing to pin. | Two small rounded speech bubbles side by side, one cobalt and one soft yellow, both empty and slightly overlapping, floating above a small flat cork-coloured pinboard in an amber frame with one pale blue blank card pinned at a slight angle. The bubbles are no wider than the board. |
| `home-welcome.png` (2400×800) | Home header | Generic stock desk (laptop with a rising bar chart), checkerboard residue baked into the desk shadow, and a 3:1 band pushes the student's own blocks below the fold on phones. Only worth redoing if Home gets a header again. | Wide 3:1 framing, generate 2400×800. A quiet study corner seen from the front at desk height: on the left a short stack of three closed books (lagoon, amber, cobalt), in the middle an open notebook with a few pale blue blank lines and a pencil, on the right a small potted plant and a mug. No laptop, no charts. Leave the left third mostly empty for a heading. No shadow under the objects except one thin flat pale blue line for the desk edge. |
