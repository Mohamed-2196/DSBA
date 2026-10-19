# Deskmates v2: cast 2 (Pip and Pod, Blink, Loupe)

Final vectors for the forum, calendar and search desk-mates. They follow `../v2/direction.md` and match cast 1
(Lumen, Stacks, Binder, Jot): 200×200 artboard, feet or base on y = 180, a 5 px `#14234D` outline, light from the
top left, one darker shade (navy at low opacity or the paper shade), cheeks `#FF8FA3` at 0.7, and a ground
shadow. `contact-sheet.png` shows every pose at 200, 96, 48 and 24 px on light and dark.

## Structure (every file)

| Group | What it holds |
| --- | --- |
| `#shadow` | The ground ellipse |
| `#rim` | The 2 px `#EAF0FF` halo for dark backgrounds. Visible by default, like cast 1: hide it on light themes with `.mate-rim{display:none}` (it is all but invisible on light anyway) |
| `#body` | The character. The body path is the same in every state |
| `#prop` | Pip's question mark; Blink's rings, and in `countdown` the arm, card and hand |
| `#face` > `#eyes`, `#cheeks`, `#mouth` | Swapped or animated per state. Pip and Pod also have `#pod-eyes`, `#pip-eyes`, `#pod-mouth`, `#pip-mouth` |
| `#sparkles` (happy), `#zzz` (sleepy), `#motion` (Loupe searching) | The state's extras |

Every group also has a `mate-<id>` class, so styles survive SVGO's id prefixing when several mates are inlined
on one page. No `<text>`, filters, masks, clip paths or `<use>`; palette colours only.

## Pip and Pod (forum) · `pip-pod-*.svg`

| State | When the app shows it | Alt text |
| --- | --- | --- |
| idle | Forum header; Home's "Replies to you" | "Pip and Pod, the forum's speech bubbles" |
| happy | Toast after "Posted" or "Marked as the answer" | "Pip and Pod, happy" |
| sleepy | Empty forum or module Threads tab: "No questions in IS2184 yet. Ask the first one." | "Pip and Pod, asleep" |

Hooks: blink `#pod-eyes` and `#pip-eyes` separately (a beat apart reads as a conversation); the question mark in
`#prop` can wiggle (rotate ±6° around 176 90) when a new reply arrives. Decorative next to a heading: use
`alt=""`.

## Blink (calendar) · `blink-*.svg`

| State | When the app shows it | Alt text |
| --- | --- | --- |
| idle | Calendar header; Home's Up next | "Blink, the calendar page" |
| happy | Toast after "Event added" | "Blink, happy" |
| sleepy | "Nothing this week. Add your own event." | "Blink, asleep" |
| countdown | "Exam in N days" on Home's Up next and the module's Dates tab, at 56 px or more | "Blink holding up a card" (the number itself must be real text) |

Hooks: `#today` is the header dot for today (it can pulse once on load). In `countdown`, `#slot` is an invisible
rect (x 150, y 28, 40 × 26 in the 200 box) on the blank card: position the number over it with `getBBox()` or
put it in an HTML layer beside the art. The card can bob 2 px (`#prop` translate) when the count changes. Below
48 px the card is too small to hold a number: show the number beside Blink instead.

## Loupe (search) · `loupe-*.svg`

| State | When the app shows it | Alt text |
| --- | --- | --- |
| idle | ⌘K palette and the search page | "Loupe, the magnifying glass" |
| happy | An exact match jump | "Loupe, happy" |
| sleepy | "Nothing for 'regresion'. Did you mean regression?" | "Loupe, asleep" |
| searching | While a search is in flight (after about 300 ms, so quick results don't flash it) | "Searching" (or `aria-busy` on the results and `alt=""` here) |

Hooks: `#lens` is the glass circle. In `searching`, `#body` and `#face` carry the same `rotate(-14 100 120)`:
sway both together (±6°, 900 ms, ease, alternate) and fade `#motion` in and out. With reduced motion, show the
still pose only.

## Shared motion

Blink every 6–11 s by scaling `#eyes` to `scaleY(0.1)` for 120 ms around the eye centre. Happy: swap to the happy
file and hop 6 px (320 ms, ease-bounce) while `#sparkles` pop in. Reduced motion: no loops or hops; states
cross-fade in 120 ms.
