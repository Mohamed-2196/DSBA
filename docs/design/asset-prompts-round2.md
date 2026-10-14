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
