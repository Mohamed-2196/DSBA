# Deskmates: the DSBA Hub's visual direction

Mohamed picked direction B from three on 2026-10-19 and asked for three changes: keep the existing DSBA Hub logo,
change the colours, and give the sidebar icons more effort. v2 made them, and he approved it. This folder is the
package the app is built from. Nothing here is in the app yet.

## What it is

- Each core section has a **deskmate**: a study object come to life. Lumen (Home, a desk lamp), Stacks (library),
  Binder (modules), Jot (notebook), Pip and Pod (forum), Blink (calendar) and Loupe (search). They sit beside Mini
  Noora, who stays the only person and whose art is unchanged.
- Every deskmate is useful. It marks where you are (section header, active tab), shows that something worked (happy)
  and shows that a list is empty (sleepy).
- The look is a cool palette around the logo's royal blue, with Bricolage Grotesque headings, a Figtree interface,
  index-card surfaces, pressable buttons, and one hand-drawn two-tone icon family.

## Inventory

| Folder | What | Status |
| --- | --- | --- |
| `v2/` | The approved direction: `direction.md`, `tokens.json`, drafts, the approved Home and library screens | approved |
| `cast-1/` | Lumen (idle, happy, sleepy, wave), Stacks, Binder, Jot; contact sheet; `CAST.md` | final vectors |
| `cast-2/` | Pip and Pod, Blink (plus countdown), Loupe (plus searching); contact sheet; `CAST.md` | final vectors |
| `brand/` | 13 nav icons and 69 UI icons (default and active), icon and brand sheets, `BRAND.md` with the token mapping | final vectors |
| `screens/` | 22 screens and `components.svg` with renders and `NOTES.md`: module, notebook, forum, calendar, search, Noora, empty states, phone and laptop, some dark | final mockups |

All SVGs pass `xmllint`. The characters and icons have no `<text>`, filters, masks or `<use>`, and their parts are
grouped by id so the app can animate eyes and mouths and theme the second tone.

## Tokens to theme

`brand/BRAND.md` section 8 maps every variable in `web/src/styles/tokens.css` to its v2 value, lists the renames
(`--cobalt` becomes `--accent`, `--signal` becomes `--success`, `--alert` becomes `--error`, the fonts become
`--font-display` and `--font-ui`) and the new variables (`--exam`, `--warning`, 32 `--sec-*` section tokens, icon
and art tokens, new radii). The app isn't released, so the renames go through in one change with no aliases.

## Fonts

Bricolage Grotesque (display, 750), Figtree (UI), JetBrains Mono (codes, times), IBM Plex Sans Arabic (Arabic).
Self-host them through Fontsource like today's faces, so the CSP stays as it is.

## Components

`screens/components.svg` and `screens/NOTES.md` name each screen's parts and whether they exist today. The new ones:
the section header with its deskmate, the desk shelf on Home (sections with live counts), deskmate toasts,
pressable buttons with an edge, the two-tone nav item and pill, the Time me pill in the new style, and sleepy empty
states in place of today's spot illustrations.

## Build order

1. **Tokens and fonts.** The new `tokens.css` and fonts, checked in both themes across every screen.
2. **Icons.** An `Icon` component in `src/ui` serving `brand/icons`, then the shell's sidebar and tab bar, then
   every icon from the brand family.
3. **Deskmates.** A `Deskmate` component (name and state, rim on dark, reduced motion), then section headers, empty
   states and success toasts.
4. **Screens, most used first.** Library, module page, Home, notebook, forum, calendar, search, Noora's panel.
5. **Review.** The UI/UX reviewer at every size in both themes, and the tester's full e2e run.

## Open items

- Decided (Mohamed, 2026-10-20): a note's page stays white in dark mode, like paper on a dark desk; ink is
  never remapped.

- The logo exists only as PNG; SVG masters would keep it sharp at every size.
- On dark, Lumen's light cone needs `.mate-light { opacity: .7 }`; ground shadows don't show on dark.
- At 24 px a deskmate reads only as a silhouette, so below 32 px the nav icons stand in.
- Blink's countdown arm reads a little like a stick; below 48 px put the number beside Blink, not on the card.
- Pip's "?" is a speck at 24 px.
- 20 px icons are a little soft on 1x screens.
- `--measure` needs re-measuring in Figtree, and `--shadow-md`/`--shadow-panel` merge into `--shadow-float`.
- Binder's cover can take each module's colour (`.mate-cover`); the screens still show it mint.
- Formulas in the mockups are stand-ins; the app keeps KaTeX.
- On phones, Noora's launcher covers part of a card on some screens, as it does today. Her placement on phones needs
  a rule: it should avoid covering content.
- "Add a card" on the "Nothing due" empty state is new UI.
- `../generated/` and `../asset-prompts-round4.md` predate this direction. Round 4's empty-state prompts give way to
  the sleepy deskmates.
