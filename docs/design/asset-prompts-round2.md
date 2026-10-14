# Asset prompts, round 2

Prompts for the artwork that round 1 (`asset-prompts.md`) didn't get right. Each section lists what was kept, what
was rejected and why, and new prompts for the rejects.

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
