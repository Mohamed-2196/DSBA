# Asset prompts, round 5: the deskmates, richer

Updated: 2026-10-19

**Optional.** The approved Deskmates direction (`deskmates/README.md`) ships as vectors drawn in code: the seven
deskmates in every state and 82 icons. The app is complete without anything here. These prompts are for an image
model, if you want richer art in the large places: empty states and section headers on laptops. Small places
(the nav, the tab bar, toasts, anything under 96 px) stay vector either way.

**The trade-off.**

| | An image model | The vectors |
| --- | --- | --- |
| Depth | More texture and light | Flat |
| Consistency | Can drift between images | Exact match across states |
| Animation | None | Eyes and mouths can move |
| Theming | One picture per theme | Re-colour for dark mode for free |
| Size | 20–60 kB per image | A few kB |

The recommendation is vectors everywhere, plus rasters only for the three laptop empty states, if the vectors look
too flat there once they're in the app.

**Capability gap.** The coding tools can't generate images. Generate the files, check them, and drop them in
`web/public/brand/incoming/`. A builder wires in only the ones you pick.

## Shared art direction

Match the vector cast exactly; the rasters must read as the same characters. Attach these as references every time
(the first is the main one):

| File | Use it for |
| --- | --- |
| `docs/design/deskmates/cast-1/contact-sheet.png` | Lumen, Stacks, Binder, Jot: shapes, faces, proportions, outline |
| `docs/design/deskmates/cast-2/contact-sheet.png` | Pip and Pod, Blink, Loupe |
| `docs/design/deskmates/v2/renders/home-screen.png` | How they sit in the app, and the palette in use |

**Palette** (from `deskmates/v2/tokens.json`):

- Outline: navy `#14234D`.
- Paper: `#FFFFFF`, with shade `#DCE6F5`.
- Sections: Home royal `#4C6EF5`, library yellow `#FFC233`, modules mint `#2DB87D`, notebook violet `#7B61FF`, forum
  pink `#F25CA2`, calendar tomato `#F0524B`, search steel `#8E9BB8`.
- Cheeks: `#FF8FA3`.

**Constraints:**

- No text, letters or digits.
- No logos.
- No people: Mini Noora is the only person and is never redrawn.
- No hands; the family has stubby arms only.
- Real transparent background (RGBA). If the model can't do that, use plain `#FF00FF` magenta, never a painted
  checkerboard.

## Requests

| ID | Priority | Where | Planned output | Status |
| --- | --- | --- | --- | --- |
| R1 | Optional, do first | Reference only (the style lock) | `deskmates-hero-sheet.png` | requested |
| R2 | Optional | Notebook empty state, laptop | `deskmate-jot-sleepy-scene.png` | requested |
| R3 | Optional | Nothing due, Home and calendar, laptop | `deskmate-blink-sleepy-scene.png` | requested |
| R4 | Optional | No lessons yet, module page, laptop | `deskmate-binder-sleepy-scene.png` | requested |

**R1. Hero sheet** (2400×1600, used as the style lock for R2–R4; not shown in the app):

```text
Character model sheet on a transparent background. Seven cute but grown-up stationery characters for a university
study app, matching the attached reference sheets exactly: soft chunky rounded shapes, 5 px navy outline #14234D,
flat fills with one darker shade, small oval eyes with a white highlight, pink cheeks #FF8FA3, tiny smile, stubby
navy feet, soft ground shadow, light from the top left. 1) a stack of yellow #FFC233 booklets with a white top
sheet face and a paper clip; 2) a mint-green #2DB87D ring binder with divider tabs in lagoon, sky and amber; 3) a
violet #7B61FF spiral notebook with a pink elastic band and a yellow pencil tail; 4) a big pink #F25CA2 speech
bubble and a small white one with a question-mark tuft; 5) a tear-off calendar page with a tomato-red #F0524B
header and binder-ring ears; 6) a royal-blue #4C6EF5 desk lamp with the face on the shade and warm light below;
7) a steel #8E9BB8 magnifying glass with a navy handle and the face in the lens. Each in three poses: idle, happy
(closed happy eyes, small sparkles) and sleepy (closed eyes, a small 'z'). No text, no logos, no people, no hands.
```

**R2 to R4. Sleepy scenes.** All three are 1200×900 (4:3), transparent, shown at 240 px wide on laptops. Attach R1
as the style reference.

```text
[R2] Spot illustration matching the attached character sheet exactly. Jot, the violet spiral-notebook character,
asleep with closed eyes and a small 'z', leaning against a short stack of two closed blank notebooks; a yellow
pencil lies beside him. Centred, filling 70% of the frame, soft ground shadow, transparent background. No text, no
logos, no people, no hands.

[R3] Spot illustration matching the attached character sheet exactly. Blink, the tear-off calendar character with a
tomato-red header, asleep with closed eyes and a small 'z', sitting beside a small steaming mug and a tiny potted
plant: nothing is due. Centred, filling 70% of the frame, soft ground shadow, transparent background. No text, no
digits, no logos, no people, no hands.

[R4] Spot illustration matching the attached character sheet exactly. Binder, the mint-green ring-binder character
with lagoon, sky and amber divider tabs, asleep with closed eyes and a small 'z', next to a small blank video screen
on a stand with a plain white triangle play shape (not any platform's logo). Centred, filling 70% of the frame, soft
ground shadow, transparent background. No text, no logos, no people, no hands.
```

## Acceptance, for each file

- Each one is a real RGBA PNG at the size asked, with a clean edge.
- The characters are recognisably the vector ones: shape, colours, eyes and cheeks match the contact sheets side by
  side.
- They read on both `#F2F5FB` and `#0B1530`, with a light rim on dark if needed.
- No text, digits, logos, people or hands.

## Return contract

Save each file with its exact prompt, and report its size and any problems. Don't approve or wire in anything:
Mohamed picks, and a builder integrates. Round 4's C1–C3 empty-state requests give way to these sleepy scenes and
are not needed under this direction.
