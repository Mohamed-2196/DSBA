# Asset prompts, round 2

Second prompts for the artwork that didn't pass review in round 1. Settings, palette and file names are as in
`asset-prompts.md`; only the prompts below change. Drop the new files into `web/public/brand/incoming/`.

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
