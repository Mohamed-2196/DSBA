# Deskmates v2 · key screens

These screens follow `../v2/direction.md` and `../v2/tokens.json`, and match `home-screen.svg` and `library-screen*.svg`.
Every colour comes from `tokens.json`: the build stops with a warning on any other hex. Every text pair is checked
against WCAG AA as it is drawn (4.5:1, or 3:1 for large text), and no screen produced a warning. The copy, tabs and
empty-state wording come from `web/src/features`. The student names are made up (Sara, Ali and Fatima), and the
screens show no emails or phone numbers.

- **Build:** `tools/build.sh` regenerates every SVG. Text widths are measured in headless Chrome with the real fonts
  and cached in `tools/widths.json`. `tools/render.py` writes `renders/*.png`. Every SVG passes `xmllint --noout`.
- **Art:** the logo is `web/public/brand/hub-lockup-horizontal(-white).png`, placed with `<image>`. Mini Noora is
  `web/public/noora/bust-neutral.png`. The desk-mates are `../v2/sections/*.svg` and `states/*`, used as they are until
  cast-1 and cast-2 land. To switch to the new cast, change `SEC_DIR` in `tools/kit.py`. The nav icons come from
  `../v2/tools/icons.py`.
- **Formulas:** they are set in Figtree italic here. The product renders them with KaTeX.
- **Sizes:** phones are 390 × 844 and laptops are 1440 × 900. The laptop sidebar is 248 px wide and the content
  area runs from 280 to 1408.

## Shared rules (they apply to every screen below)

- **360 px phones.** The 16 px gutters stay. Cards go full width, and the band titles wrap onto a second line. A
  desk-mate in a band shrinks from 98 px to 80 px, and below 340 px of content it is hidden (the band colour still
  says where you are). Tab rows scroll sideways inside their own strip with an edge fade, so the page itself never
  scrolls sideways. Buttons in empty states stack.
- **2560 px and wider.** The sidebar stays 248 px. Content is capped at 1280 px and centred. On the module page and
  in the forum, the side column grows to 400 px instead of the cards stretching. Prose keeps its `68ch` measure. The
  calendar month grid can grow to 1600 px, because its cells hold chips, not prose.
- **RTL.**
  - Arabic posts, notes and Noora's replies are set in IBM Plex Sans Arabic at 16/28, right-aligned with
    `dir="rtl"` on the block.
  - The interface around them (bylines, buttons, counts) stays LTR unless the whole UI is switched to Arabic.
  - If the UI is switched, these flip: the sidebar moves to the right, back chevrons and the accepted-answer rule
    mirror, and Noora's launcher defaults to bottom-left.
  - These never flip: module codes, the Latin text of formulas, and mono timers.
- **Motion** (`direction.md` §Motion):
  - The desk-mates blink every 6–11 s, one at a time.
  - The nav pill slides between items.
  - Toasts hop.
  - With reduced motion, all of these become a 120 ms cross-fade.

## Module page: ST2134, Overview (`module-laptop`, `module-phone`, `module-phone-dark`)

- **Purpose:** the module's home. You see the next dates, the latest sittings, your notes, the discussion and your
  progress without opening a tab.
- **Components:**
  - Existing: `PageHeader`/`mod-head`, `Tabs` (Overview · Lessons 48 · Files 36 · Discussion 21, as in
    `ModulePage.tsx`), `Panel` blocks from `ModuleOverview.tsx` (Next dates, Latest past papers, Pick up where you
    left off, Discussion), `Badge` (Year 2, the exam), `Button`, and the Noora launcher.
  - New: the **sittings table**, which replaces the row list (`latestSittings` already gives sittings → zones), and
    a **"Your notes" block** that uses `useModuleNotes`, which is public now.
- **Character:** Binder, idle, in the band. It says "you're in Modules". The band uses the Modules pill colour, and
  Binder's divider tabs repeat the year colours.
- **Motion:**
  - Binder blinks.
  - The exam badge's calendar glyph pulses once on load when the exam is 7 days away or less.
  - The table row lifts to inset on hover.
- **360 px:** "About this module" folds the description away, which already happens on phones. The table drops RTC
  and shortens its cells to the doc icon plus a score, "New" or "Open". The blocks stack in this order: Next dates,
  papers, notes, progress, discussion.
- **2560 px:** the table gains a "Time me" column, and the blocks sit in a 3 × 2 grid.
- **RTL:** the table's columns mirror. Module codes and zone letters stay LTR.
- **Dark:** Binder gets a 2 px halo. The exam badge uses `#FF7EB0` with `#0B1530` text.

## Notebook (`notebook-phone`, `notebook-laptop`)

- **Purpose:**
  - Phone: reading and typing a note.
  - Laptop: annotating a past paper (ST2134 · May 2023 · Zone A) with the pen.
- **Components:**
  - Existing: `Toolbar` tools (Type, Pen, Highlighter, Eraser, Lasso; T/P/H/E/L), `NoteHeader` ("Saved in…"),
    `PagesDrawer`, pen colour and width, Undo/Redo, Print or save as PDF, the video time stamp (ST-44), and the
    checklist.
  - New look: on phones, the tools sit in a bottom bar where thumbs reach, and the formatting toggle and Σ share
    that bar. The tooltip shows the shortcut letter.
- **Characters:**
  - Jot, idle, in the toolbar ("beside the pen tools", as the direction says).
  - Jot, happy, in the "Saved" toast on the phone. Saving is the moment that worked.
- **Motion:**
  - Jot hops in the save toast.
  - The active tool's pill slides.
  - The pen cursor ring follows the stylus.
  - A highlighter stroke fades in at 50%.
- **360 px:** the title wraps onto two lines. The tool bar keeps its five 44 px modes, and formatting moves into one
  "Aa" sheet.
- **2560 px:** the PDF page stays at its real width, centred, and the pages drawer can sit left or right.
- **RTL:** typed text in Arabic aligns right inside its box. Ink is positional and never mirrors. The tool order
  mirrors.

## Forum (`forum-list-laptop`, `forum-list-phone`, `forum-thread-laptop`, `forum-thread-phone`, `forum-thread-phone-dark`)

- **Purpose:**
  - The list shows the **Yours** tab: threads you started, replied to or follow, newest activity first, with no
    sort (as in `ForumFilterBar`).
  - The thread shows the accepted answer and a formula.
- **Components:**
  - Existing: `PageHeader` with live stats ("14 replies today", "3 questions are waiting for a first reply"),
    category tabs, "No replies yet" and tag chips, `ThreadRow`, `ForumSidebar`, `ReplyByline` ("Accepted answer",
    "Author"), `VoteButton`, `FollowButton` ("Following"), and `ReplyComposer` ("Write a reply…").
  - New: the pink **unread rule** on a row with new activity, and the **success rule** down the accepted answer.
- **Characters:**
  - Pip and Pod, idle, in the band.
  - Pip and Pod, happy, in the "Marked as the answer" toast on the laptop.
- **Motion:**
  - The unread dot fades when you open the thread.
  - The accepted badge's tick draws itself in over 200 ms.
  - The vote count rolls (`RollingNumber`).
- **360 px:** titles wrap to two lines, and "Answered" moves to the row's third line so Noora never covers it. When
  you scroll a thread, a compact top bar appears with the title on one line.
- **2560 px:** the list caps at 800 px and the sidebar grows.
- **RTL:** Fatima's reply is drawn right-aligned in IBM Plex Sans Arabic. Its byline stays LTR.
- **Dark:** on the dark phone thread, Noora's launcher has been dragged to the left edge. This shows the snap and
  remember behaviour, and it keeps the RTL lines clear.

## Calendar (`calendar-laptop`, `calendar-phone`)

- **Purpose:**
  - Laptop: the month.
  - Phone: the agenda (List).
  - Both show an exam (ST2134, Thu 23 Oct, 9:00) and a VLE window (ST2134 MCQ on VLE, open now, closes Wed 22 Oct).
- **Components:**
  - Existing: `PageHeader` actions (Customise, Subscribe, New event), the List/Month `SegmentedControl`, the cohort
    select, `MonthGrid`, `ForYou` ("Your next exam", "1 more exam after it"), and the `DateLeaf` slip.
  - New: the **window bar**. A VLE window spans its open days and is labelled by its closing day.
  - The type colours follow `eventMeta.ts`: exam raspberry, mock accent, revision success, deadline yellow, event
    amber with the word "Event", term dates inset, and your own events dashed.
- **Character:** Blink, idle, in the band. Its header dots mark today.
- **Motion:** the today ring and the exam slip get one soft pulse when the exam is under 7 days away. Month changes
  slide 200 ms.
- **360 px:** the agenda only. Month view becomes a 7-column grid of dots, and tapping a day opens its list.
- **2560 px:** cells widen and show up to three chips before "+2 more".
- **RTL:** in Arabic UI the week starts on Saturday (a locale setting). Month navigation chevrons mirror.

## Search: the ⌘K palette (`search-laptop`, `search-phone`)

- **Purpose:** jump to anything. The screens show the spelling correction from `CommandPalette.tsx`: "Nothing
  matched 'regresion'. Showing results for 'regression'."
- **Components:**
  - Existing: the `CommandPalette` input, result groups (Lessons, Library, Forum, Modules), `Highlight` marks,
    `Kbd`, and the footer ("↑ ↓ to move · ↵ to open · Esc to clear").
  - New: Loupe sits in the input row, and each group icon sits on its section pill.
- **Character:** Loupe, idle, beside the query: "you're searching". On an exact match it turns happy and the row
  jumps open. Loupe stays idle here because a correction isn't an empty result. The sleepy state is kept for "No
  results for…".
- **Motion:**
  - The highlight swipes in (`ui-hl-swipe`, 700 ms).
  - The active row slides.
  - The correction line fades in.
- **360 px:** the palette is a full-screen sheet, the keyboard hints are gone, and rows are 58 px.
- **2560 px:** the palette stays 640 px wide, 92 px from the top.
- **RTL:** Arabic queries align right in the field. Group order is unchanged.

## Mini Noora's chat (`noora-laptop`, `noora-phone`)

- **Purpose:** ask about where you are. The screens show the exam date, then "What is a p-value?" with a formula and
  "Where to look" links into the lessons and a past paper.
- **Components:**
  - Existing: the `ChatPanel` header ("Mini Noora", "Knows your modules and this page", Recent chats, Clear chat,
    Hide), `Messages`, `Formula`, the "Where to look" refs, "Copy answer", the "For this page" prompts, and the
    `Composer` ("Message Mini Noora", attach, send).
  - New look: her messages sit on surface with a 3 px lavender rule, and yours sit on accent-soft.
- **Characters:** Noora only (her bust, unchanged). The desk-mates never appear in the chat.
- **Motion:**
  - The panel springs up from the launcher (320 ms).
  - Her answer streams in.
  - With reduced motion it simply appears.
- **360 px:** a full-height sheet with a drag handle, and the prompts wrap.
- **2560 px:** the panel stays 380 px wide, anchored bottom-right of the content.
- **RTL:** her Arabic answers right-align. Formulas stay LTR inside them.

## Empty states (`empty-notes-*`, `empty-due-*`, `empty-lessons-*`)

All three use the `EmptyState` component (existing), with a sleepy desk-mate at 160 px (116–150 px on phones), a
title, a body and actions.

| State | Character (sleepy) | Copy (from the code) | Why this mate |
| --- | --- | --- | --- |
| No notes yet (Notes) | Jot | "No notes yet" · "Type with rich text, write with stylus ink, or annotate past papers." · New note, Annotate a past paper | Notes are Jot's section |
| Nothing due (Boards, Today) | Blink | "Nothing due in the next 7 days" · "Cards with a due date show here from all your boards, overdue ones first." | Boards has no mate. Due dates are Blink's job |
| No lessons yet (EC1002, Lessons) | Binder | "No video lessons for EC1002 yet" · "The study guide and past papers are in Overview…" · Upload a file, See resources | A module's tab belongs to Binder |

- **New:** the "Add a card" button on Nothing due is not in `TodayView.tsx` yet. On phones, the second action becomes a
  quiet text button, so the launcher never covers it.
- **Motion:** the "z z" drifts up 4 px on a 3 s loop, and stops with reduced motion.
- **360 px:** the character drops to 116 px and the buttons go full width.
- **2560 px:** the card caps at 720 px, centred.

## Components (`components.svg`)

The sheet covers:
- Buttons: primary, secondary, quiet, danger, pressed and disabled, in light and dark, plus 40 px laptop sizes.
- Inputs: default with ⌘K, focused, error with message, select, switch and tick.
- Chips: default, section-selected, clearable, Filters with a count, and small.
- Tabs and segmented controls.
- Cards: paper card with Time me, thread row, module card and doc thumbnails.
- The sittings table.
- Toasts with happy Stacks, Jot, Pip and Pod, Blink and Binder, plus one dark toast.
- Dialogs: delete thread (danger) and hide Noora.
- The bottom tab bar, light and dark.
- Sidebar item states (default, hover, active, focus ring, count), light and dark.
- Badges and pills.
- The Time me pill: idle, running, 10 minutes left (warning) and 2 minutes left (exam).

## Weak spots and what's left

- The desk-mates are the v2 drawings. Swap in cast-1/cast-2 once they're approved.
- Binder keeps its mint cover. The direction asks for the cover in the module's own colour, which needs a recoloured
  Binder with on-token shades.
- Formulas are an approximation of KaTeX. The hat on λ in the notebook is drawn by hand.
- The calendar is set in October 2025, to match the Home render ("ST2134 · Oct 2025" papers). Home's "Wednesday 19
  October" doesn't match that year's weekday.
- On phones, Noora's launcher covers part of a card on the module, forum list and empty-lessons screens. That's the
  approved behaviour, but a rule ("rise above the last action") would help.
