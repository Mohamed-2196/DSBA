# Module icons

One flat icon per module, 512×512 transparent PNG, named `module-<code or id>.png`, mapped in
`web/src/ui/moduleArtSrc.ts`. Style references: `module-ec1002.png` and `module-st2133.png`.

## Still missing (7), waiting on Mohamed

IS2184 and the six Year 3 modules (Machine Learning, Statistical Methods for Market Research, Microeconomics,
Principles of Asset Pricing, Marketing Management, Further Mathematics for Economists). Their prompts are under
"Module icons" in `docs/design/asset-prompts-round2.md`; the first round's versions were rejected for gloss, 3D,
gradients and painted checkerboards.

**For the next agent:** when Mohamed says the new images are in a folder (last time
`~/Downloads/image from claude prompt/`), copy only the images to the scratchpad (never anything else from
Downloads), review each strictly against the two references (KEEP or REJECT with a reason), prepare the keepers
(transparent background, trim, 512×512, optimised PNG, named as above), add them to `moduleArtSrc.ts`, run
`scripts/check.sh web`, and give Mohamed new prompts only for rejects.
