# Asset prompts

Prompts for the hub's real artwork: the DSBA Hub lockup, the module icons, Mini Noora and the empty-state art. Run them
yourself, then drop the files into `web/public/brand/incoming/` under the names in that folder's README.

**Generator settings.** Use one image model for each set (GPT Image, Midjourney v7, Ideogram 3 or Recraft v3; Recraft
and Ideogram handle lettering and flat vector best). Ask for a **transparent background**; if the model can't, ask for
plain white `#FFFFFF` and remove it afterwards. Square sets use **1:1**. Noora's full-body poses use **6:7**, and her
busts 1:1. For **consistency**, make the first image of each set, keep its seed (Midjourney `--seed`, or `--sref`/
`--cref` pointing at it; in other tools, attach it as the style or character reference), and reuse it for every other
prompt in the set. Generate at 2x or more, then downscale. Nothing may contain third-party logos or imitate one.

Palette (from `web/src/styles/tokens.css`): DSBA royal blue `#1F3A93` (the logo's own blue), cobalt `#1558F0`, navy
`#0C2D75`, ink `#0A1F44`, Year 1 lagoon `#0FA3B1`, Year 2 azure `#1F6FEB`, Year 3 amber `#F08C00`, highlight
`#FFE14A`, signal green `#12B886`, paper `#F4F7FC`.

---

## 1. DSBA Hub lockup and app icon

Attach `web/public/brand/dsba-logo.png` as the reference image for every prompt in this section.

**1a. Horizontal lockup.** The wordmark in the header and on the sign-in screen. 2400×600 transparent PNG (4:1, or
generate 16:9 and crop), flat vector. Files: `hub-lockup-horizontal.png` and `hub-lockup-horizontal-white.png`.

```text
Flat vector wordmark on a transparent background. Extend the attached "DSBA" logo with the word "Hub" so the result
reads "DSBA Hub" as one family. Keep "DSBA" exactly as in the reference. Draw "Hub" in the same lettering: very heavy,
wide geometric sans-serif, flat terminals, tight counters, the same cap height and stroke weight as "DSBA", "H"
uppercase and "ub" lowercase with x-height at about 72% of cap height. Continue the reference's white swoosh: the same
two thin, gently rising curved white cuts slicing through "DSBA" carry on through "Hub" at the same angle and
thickness, as if one continuous stroke. Letter spacing between "DSBA" and "Hub": one wide space. Single solid colour
#1F3A93, no gradients, no shadows, no outlines, no 3D, no extra marks. Crisp edges suitable for vector tracing.
```

For the white version, run the same prompt with: `Letters solid white #FFFFFF, the swoosh cuts transparent, shown on a
#0C2D75 navy preview background (remove the background after).`

**1b. Stacked lockup.** Narrow places (phone sign-in, the footer, social cards). 1200×900 transparent PNG (4:3).
Files: `hub-lockup-stacked.png` and `hub-lockup-stacked-white.png`.

```text
Flat vector wordmark on a transparent background, stacked on two lines, centred: "DSBA" on top exactly as in the
attached reference logo, and "Hub" underneath, drawn in the same very heavy, wide geometric sans-serif with flat
terminals, "H" uppercase and "ub" lowercase, set so "Hub" is about 60% of the width of "DSBA". The reference's white
swoosh (two thin, gently rising curved cuts) runs through both lines as one continuous sweep at the same angle and
thickness. Single solid colour #1F3A93, no gradients, no shadows, no outlines, no 3D, no extra marks. Crisp edges for
vector tracing.
```

White version: as in 1a.

**1c. App icon.** Browser tab, home-screen icon, PWA. 1024×1024 PNG with the blue tile filling the canvas (no
transparency outside the tile; the OS rounds corners). Files: `hub-icon-1024.png`, plus a maskable copy
`hub-icon-maskable-1024.png` with the mark inside the central 80%.

```text
Flat vector app icon, 1:1. A solid #1F3A93 royal-blue square. Centred, a white monogram "DH" in the attached logo's
lettering: very heavy, wide geometric sans-serif, flat terminals, the "H" slightly smaller and tucked against the "D"
so they read as one compact block about 56% of the icon's width. The reference logo's swoosh, two thin gently rising
curved cuts, slices through both letters in the blue of the background. No gradients, no shadows, no glow, no border,
no other text. Crisp, simple, readable at 32 px.
```

---

## 2. Module icons

One per module, shown on the module cards and the contents page in place of the bold code text. 512×512 transparent
PNG, subject centred in the middle 80%. Paste the preamble, then one subject line, as one prompt. Make EC1002 first,
then pass it as the style reference for the other fifteen. File names are in the list.

**Preamble (paste first, every time):**

```text
Flat vector icon, 1:1, transparent background. One simple symbolic object, centred, filling about 80% of the frame.
Style: modern editorial flat illustration, geometric shapes, soft rounded corners, no outlines or very thin #0A1F44
outlines, two or three flat colours only, chosen from: royal blue #1F3A93, cobalt #1558F0, lagoon #0FA3B1, amber
#F08C00, soft yellow #FFE14A, with white #FFFFFF for highlights. One subtle flat shadow shape at most; no gradients,
no texture, no 3D, no photorealism. Absolutely no text, letters, numbers, symbols that read as letters, or logos.
Calm, grown-up, university feel, consistent with a set of 16 matching icons. Subject:
```

**Subjects:**

| File | Module | Subject line |
| --- | --- | --- |
| `module-ec1002.png` | Introduction to Economics | Two crossing curves, one rising and one falling, on a simple pair of axes, with a small coin resting where they meet. |
| `module-mn1178.png` | Business and Management in a Global Context | A briefcase in front of a simple globe with three latitude lines. |
| `module-mt1186.png` | Mathematical Methods | A smooth curve on a small grid with a tangent line touching it, and a shaded area beneath part of the curve. |
| `module-st1215.png` | Introduction to Mathematical Statistics | A bell curve over a row of four bars of a histogram, plus a single die beside it. |
| `module-st2133.png` | Advanced Statistics: Distribution Theory | Three overlapping smooth density curves of different shapes, one narrow, one wide, one skewed. |
| `module-st2134.png` | Advanced Statistics: Statistical Inference | A magnifying glass over a bell curve whose two outer tails are shaded. |
| `module-st2195.png` | Programming for Data Science | A laptop whose screen shows abstract coloured lines of code made of rounded bars (no characters), with a small bar chart beside it. |
| `module-st2187.png` | Business Analytics, Applied Modelling and Prediction | A rising bar chart with a dashed forecast line extending past the last bar towards a small target. |
| `module-ec2020.png` | Elements of Econometrics | A scatter of dots with a straight regression line through them, and a small coin stack at one corner. |
| `module-is2184.png` | Information Systems Management | Three stacked server blocks linked by thin lines to a small network of three nodes. |
| `module-machine-learning.png` | Machine Learning | A simple neural network of three columns of round nodes joined by lines, with one output node highlighted. |
| `module-market-research.png` | Statistical Methods for Market Research | A clipboard survey with three tick rows, beside a small pie chart. |
| `module-microeconomics.png` | Microeconomics | A balance scale with a small house on one pan and a stack of coins on the other. |
| `module-asset-pricing.png` | Principles of Asset Pricing | A candlestick chart of five candles trending upward with a small shield behind it. |
| `module-marketing-management.png` | Marketing Management | A megaphone with three short sound arcs and a small shopping bag. |
| `module-further-maths.png` | Further Mathematics for Economists | A 3D surface drawn as a curved wireframe grid with a single point marked at its peak. |

---

## 3. Mini Noora, refreshed

She stays the hub's guide (draggable, she walks, talks and reacts), but grows up: adult proportions, calmer face, a
cleaner illustration style. Keep her identity: cream hijab wrapped loosely around the neck, warm light-tan skin, brown
eyes, a navy two-button suit jacket and trousers, a cream blouse, dark brown shoes, a small round white pin on the left
lapel. **The pin is plain white with no letters or logo.** Same poses and canvases as `web/public/noora/sprites.json`,
so the files drop in 1:1.

- Full body: 680×784 transparent PNG, feet on the line 16 px above the bottom edge (y=768), centred on x=340, the same
  height in every pose. Generate at 6:7 and crop to fit.
- Bust: 600×600 transparent PNG, head and shoulders, the same framing in every bust.

**3a. Character sheet (make this first; it is the reference for every pose).** File: `noora-sheet.png`, any size,
not used by the app.

```text
Character design sheet, transparent or plain white background, flat vector illustration. A young Bahraini university
woman in her early twenties, a student guide. Adult proportions (head about one sixth of her height), slim, upright,
confident posture. Natural, friendly face: almond-shaped brown eyes of normal size (not oversized, not chibi), soft
defined brows, small nose, a gentle closed-mouth smile, light blush. Warm light-tan skin. Cream hijab #F3EBDD draped
softly and wrapped loosely around the neck and shoulders. Tailored navy suit #1B2F63: two-button jacket with notch
lapels and matching straight trousers, cream blouse beneath, dark brown flat shoes. A small plain round white pin on
her left lapel with nothing on it. Style: clean modern editorial vector, smooth shapes, thin dark-navy #0A1F44
outlines, flat colour with one soft shade tone per colour, no gradients, no texture, no anime, no chibi, no 3D.
Show her in four views on one sheet: front, three-quarter, side profile facing right, back. No text, no logos.
```

**3b. Poses.** Paste this prefix, then the pose line, with the sheet attached as the character reference and the seed
reused.

```text
The same character as the attached character sheet, identical face, outfit, colours and line style, flat vector,
transparent background, full body, standing on an invisible ground line, nothing cropped, no text, no logos. Pose:
```

| File | Pose line |
| --- | --- |
| `idle.png` | Facing the viewer, relaxed and upright, arms loosely at her sides, gentle smile. |
| `side-right.png` | Side profile facing right, standing still, arms at her sides, calm expression. |
| `side-left.png` | Side profile facing left, standing still, arms at her sides, calm expression. |
| `back.png` | Seen from behind, standing still, arms at her sides, the hijab draping down her back. |
| `walk-right.png` | Walking to the right in profile, mid-stride, one arm swinging forward, light confident step. |
| `walk-left.png` | Walking to the left in profile, mid-stride, one arm swinging forward, light confident step. |
| `talking.png` | Facing the viewer, mouth open mid-sentence, one hand raised palm-up at chest height as if explaining. |
| `happy.png` | Facing the viewer, warm open smile, hands lightly clasped in front of her. |
| `excited.png` | Facing the viewer, bright smile, both fists raised to shoulder height in a small celebration. |
| `surprised.png` | Facing the viewer, eyebrows raised, mouth a small round "o", one hand near her cheek. |
| `sad.png` | Facing the viewer, small sympathetic frown, head tilted slightly, hands together in front. |

For busts, swap "full body, standing on an invisible ground line" for "head and shoulders bust, centred, cropped at
mid-chest":

| File | Pose line |
| --- | --- |
| `bust-neutral.png` | Calm, attentive, soft closed-mouth smile, looking at the viewer. |
| `bust-wave.png` | Smiling and waving with her right hand raised beside her face. |
| `bust-thinking.png` | Looking up and to the side, one finger resting on her chin, thoughtful. |
| `bust-laughing.png` | Laughing naturally, eyes slightly closed, a hand near her mouth. |
| `bust-winking.png` | A friendly wink with one eye, a small knowing smile. |
| `bust-angry.png` | Mildly cross rather than furious: brows drawn together, lips pressed, arms folded. |

---

## 4. Empty-state and Home spot illustrations

Small scenes for empty lists and errors, in the module-icon style. 800×600 transparent PNG (4:3). Paste the module
icon preamble from section 2, replace "One simple symbolic object" with "One small calm scene of two or three
objects", then add the subject. Pass `module-ec1002.png` as the style reference.

| File | Where | Subject line |
| --- | --- | --- |
| `empty-nothing-due.png` | Home and calendar, nothing due | A desk calendar with every day ticked, a cup of tea steaming beside it, a small potted plant. |
| `empty-no-notes.png` | Library or a module with no notes yet | An open notebook with blank pages, a pencil resting across it, a closed folder behind. |
| `empty-board.png` | Forum board with no threads | Two empty speech bubbles side by side above a small pinboard with no notes on it. |
| `empty-offline.png` | Offline or the server can't be reached | A laptop with a small unplugged cable and a cloud with a gap in it. |
| `empty-search.png` | Search with no results | A magnifying glass over a stack of three closed books and a few small sparkle marks. |
| `home-welcome.png` | Home header, in place of the pulse line | A wide, quiet desk scene: an open laptop showing a simple bar chart, a stack of books, a mug, a small plant, seen from slightly above, wide 3:1 framing (generate 2400×800). |
