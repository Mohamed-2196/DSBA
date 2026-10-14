# UI/UX review: DSBA Hub on the real API

## Round 10 review (14 October 2026)

Reviewer: UI/UX. Build: `feature/backend` at `6c90aa9` (rounds 5 to 9 merged), on the shared Docker stack
(`:5173`), every feature switched on. No application code was changed.

Method: Playwright 1.56 driving the installed Google Chrome, signed in by dev-login as Sara (Year 2), a Year 1
student, Rami (rep, Year 3) and Mohamed (admin). Twenty-one screens at 390×844 (touch, mobile), 820×1180 (touch)
and 1440×900, light and dark, with scripted checks for sideways scroll, elements past the viewport, touch targets
under 44 px and page errors; flows walked by script with screenshots: Customize Home, Mini Noora (drag, chat card,
an answer, chips), ⌘K search into a PDF page, papers by sitting and Time me, Your papers, a request with "me too",
forum new thread and a thread, Manage (Gaps, Sunday summary, Numbers, Modules editor), lessons, Career Navigator and
grades examples. Noora's landscape chat was checked at 844×390. Slow and empty answers were simulated with route
interception, never on the API.

**Caveats.** An e2e run shared the stack: some switches (board, summary, daily question, paper questions) were
off for parts of the pass, and the data carries "[e2e 0rplyuk]" items. Noora's AI is off locally (no Claude key),
so her rich answers were seen only in script mode. Test data I left: Sara's request "ST2133 examiners' report for
2024".

### Summary

The rounds 5–9 work holds up structurally: **no sideways scroll** and no element off screen on any of the 21
screens at the three sizes in either theme; Customize Home, Your papers, the request form and the module editor
fit 390×844 and 844×390 with their actions visible and focus inside; dark mode is consistent, and the new lockup,
app icon, 9 module illustrations, 4 empty-state pictures and Noora's sprites look like real assets.

What falls short of Mohamed's bar is mostly polish and a few real breaks: Your account can crash on load (UX-28),
Noora's chat has no room on a landscape phone and hides her own answers (UX-29), and reps can't see five of
Manage's thirteen tabs even on a laptop (UX-30). The rest is placeholder visuals, naming and content tidiness.

**Top ten to fix:**
1. UX-28 (major): Your account crashes when the module catalogue arrives after the page.
2. UX-29 (major): Noora's chat: no room in landscape; the AI-off notice and the scroll hide her answer.
3. UX-30 (major, reps): Manage hides 5 of 13 tabs at 1440 px, 8 on a tablet, 11 on a phone.
4. UX-31: Noora still parks on content by default on every screen.
5. UX-32: Home calls an open application "Past"; "New in my modules" is six identical "Course materials".
6. UX-33: "Your papers" clashes with "Past papers", claims "every Year 2 module", and uses checkboxes for "take one".
7. UX-34: the module's "Past papers" button leaves for Google Drive; the Hub's own sittings are a tab away.
8. UX-35: placeholder visuals and third-party logos left (newsletter "01 Coming soon", grades, sidebar crests).
9. UX-36: search shows duplicate files and raw file names; titles truncate on phones.
10. UX-37: Time me on phones counts down on a page the student isn't looking at.

### Earlier findings

| ID | Was | Now | Evidence |
|---|---|---|---|
| UX-1 to UX-17 | major/minor/nit | **fixed** (as round 3) | Not re-broken: sign-in recovery, menu keyboard paths, editor leave guard, 44 px controls and error copy behave as before. |
| UX-18 to UX-22 | minor | **fixed** | Separators, chip contrast, measure, "Showing Year 1", the crash screen (title, heading, "Go to Home") all in place; UX-28 lands on that screen. |
| UX-23 | nit | **open** | Rep's draft titles on `/newsletter` measure 278×31 and 324×31 at 390 px with touch (`NewsletterPage.css:189`). |
| UX-24 | nit | **partly fixed** | Library lines now say "a library file" only when the title is missing (`access/audit.ts:86-87`); "added an event:" and "hid a thread:" keep their colons. |
| UX-25 | nit | **open** | The leave dialog still offers "Cancel" (no `cancelLabel`, `newsletter/editor/Editor.tsx:611`); `.nl-editor__side` still has no `tabIndex`/region (`:605`). |
| UX-26 | nit | **partly fixed** | Calendar respects reduced motion; `GradesPage.tsx:257` and `StyleGuidePage.tsx:185` still force `smooth`; `YourUploads.tsx:59` still says "A student rep decided not to publish this one." |
| UX-27 | nit | **open** | `FileThumb.tsx` draws no picture; JPG and PNG notes get the printed card (see UX-35). |
| R-7 Noora notes | — | **partly addressed** | She is draggable and her chat is a card; her default spot still covers content (UX-31) and landscape is cramped (UX-29). |

### Responsive results

- **Sideways scroll: none.** 21 routes × 390, 820, 1440 × light, dark as Sara; Manage, Access, the style guide,
  requests and the newsletter as the admin. No `scrollWidth > clientWidth`, no visible element past the viewport.
- **Dialogs on short screens: fit.** Customize Home (374×776 at 390), Your papers (560×374 at 844×390), Ask for
  something, the search palette and the Time me menu keep their actions in view and take focus; Esc returns focus to
  the opener. Noora's chat card fits but has no room for the conversation in landscape (UX-29).
- **Touch targets:** the page-level controls pass. Leftovers: UX-23, Noora's mascot at 40×84 on phones (UX-31),
  the electives' module title links at 25 px (UX-43).
- **Long pages:** Career Navigator is 13,800 px at 390 px (UX-38); the calendar 3,900 px.

### New findings

| ID | Severity | Title |
|---|---|---|
| UX-28 | major | Your account crashes when the module catalogue loads after the page |
| UX-29 | major | Mini Noora's chat: no room in landscape, and her answer is hidden behind the notice and the scroll |
| UX-30 | major | Manage hides most of its 13 tabs, with nothing to show they are there |
| UX-31 | minor | Mini Noora still stands on content by default; her phone hit area is 40 px wide |
| UX-32 | minor | Home's blocks: an open application reads "Past", and "New in my modules" repeats "Course materials" |
| UX-33 | minor | "Your papers": a name that clashes with "Past papers", a wrong summary, and checkboxes for "take one" |
| UX-34 | minor | The module's "Past papers" button opens Google Drive, not the Hub's papers by sitting |
| UX-35 | minor | Placeholder visuals and third-party logos left on real screens |
| UX-36 | minor | Search and the library: duplicate files, raw file names, and titles cut short on phones |
| UX-37 | minor | Time me on phones counts down out of sight |
| UX-38 | minor | Career Navigator is 16 screens long on a phone |
| UX-39 | nit | Section links wrap under their headings on phones and read as captions |
| UX-40 | nit | Copy: formulas, block names, "script", "0 me too" and others |
| UX-41 | nit | Module editor: focus, Save out of reach, and an Icon field that does nothing for 9 modules |
| UX-42 | nit | "Install the app" lives only in Year 1's Start here |
| UX-43 | nit | Small leftovers: electives links, footer alignment, the library search placeholder |

#### UX-28 Your account crashes when the module catalogue loads after the page (major)

- **Where:** `/account`, any size, any signed-in persona. Seen unprompted at 820×1180 and 1440×900 (2 of 8 direct
  loads); every time with the catalogue delayed 2.5 s (a phone on campus Wi-Fi). Screenshot:
  `screens/ux10-account-crash-390.png`.
- **What a student sees:** "This page didn't load. Something went wrong while showing this page" instead of their
  account. The console says `useModules() must be used inside <ModulesGate>`.
- **Why:** the route is `modules: false` (`routes.tsx:30`), so it renders without waiting for the catalogue, but its
  "Your papers" section calls `usePapers()` → `useModules()` (`features/papers/usePapers.ts`), which throws until the
  catalogue is there. Board, Manage and the 404 (also `modules: false`) don't crash.
- **Fix:** wrap the account's Your papers section in its own `<ModulesGate fallback={<Skeleton/>}>`, or drop
  `modules: false` from the account route. Add an e2e that delays `/api/v1/modules` and loads `/account`.

#### UX-29 Mini Noora's chat: no room in landscape, and her answer is hidden (major)

- **Where:** her chat card; 844×390 (landscape phone) worst, 390×844 too. Screenshot:
  `screens/ux10-noora-landscape-844.png`.
- **What a student runs into:**
  - At 844×390 the card is 302 px tall; the header, the yellow "My AI answers aren't available right now…" notice
    and the composer take all of it. The conversation shows a 20 px sliver: she can ask but can't read the answer.
  - The notice stays pinned above the messages on phones too and covers the top of each answer (at 390 px it hides
    the first line of "Where to look").
  - After an answer the list scrolls to the bottom (`noora/Messages.tsx:255`, `scrollTo({ top: scrollHeight })`),
    so a phone shows "Try asking" chips and the composer; the answer's first lines are above the fold.
  - The footer "She answers from the Hub's modules and calendar. What you send…" is cut with an ellipsis.
- **Fix:** show the AI-off state once, as a line in the conversation (or a dot and "Script mode" under her name),
  not a pinned banner; scroll a new answer's *start* into view (`turn.scrollIntoView({ block: 'start' })`), not the
  list's end; below 480 px of height, open the chat as a full-height sheet and drop the footer note into the "…"
  menu.

#### UX-30 Manage hides most of its 13 tabs (major, for reps and admins)

- **Where:** `/manage` as the admin. Hidden past the right edge: Suggested videos, Gaps, Numbers, People and
  Activity at 1440 px; also Sunday summary to Modules at 820 px; everything after Uploads at 390 px. Screenshot:
  `screens/ux10-manage-tabs-1440.png`.
- **What a rep runs into:** the tab strip scrolls sideways with no fade, arrow or "More", so Gaps (built in round 6
  for exactly them) and People look like they don't exist. Reports, Uploads and Requests carry counts; the others
  don't say whether anything waits.
- **Fix:** at 1024 px and up, make Manage's sections a vertical list on the left (13 items fit); below that, a
  `Select` ("Show: Reports (2)") or a grouped sheet. Group them: *Waiting* (Reports, Uploads, Requests, Suggested
  videos), *Publish* (Newsletter, Calendar, Sunday summary, Career Navigator, Modules), *Look after* (Gaps, Numbers,
  People, Activity). Keep counts on every waiting item.

#### UX-31 Mini Noora still stands on content by default (minor)

- **Where:** every screen, 390 and 1440 px. At 390 her hint covers the second and third "Coming up" rows on Home;
  she stands over the thread sort ("Oldest"), the grades bands, the career cards and the Start here arrows. At
  1440 she covers "Open the library" on Home.
- **What a student runs into:** she is draggable now, which is good, but nothing says so until the hint, and
  every new student starts with her on top of the page. Her button at 390 px is 40×84: under 44 px wide.
- **Fix:** start her in the bottom gutter *above* the tab bar on phones (or tucked half off the right edge, peeking),
  remember where she's dropped (she does) and her hint only once per account; give `.noora__pose` a 44 px minimum
  hit area; on pages with a right-hand column at 1440 px, start her in the left of the gutter below the sidebar.

#### UX-32 Home's blocks say the wrong thing or nothing (minor)

- **Where:** Home, Year 3 rep at 1440 px and Sara at 390 px. Screenshot: `screens/ux10-home-y3-1440.png`.
- **What a student reads:**
  - "Coming up" lists "Tue 13 Oct NBB EVOLVE applications … **Past**" as its first row, though the window runs to
    24 October; the calendar's "This week" calls the same event "11 days left".
  - "New in my modules" is six rows that all read "Course materials · <module> · Course materials · 1 Sept 2026":
    nothing to open that's new, and no way to tell them apart.
  - "Help the year below" here, "Help the years below" in Customize Home.
- **Fix:** for events with an end date, show "Open until 24 Oct" (and sort by end date) instead of "Past"; leave
  rows whose start is past only if they are still open. In "New in my modules", skip Drive-folder link items and
  group imports ("12 files added to ST2133"), so each row is something new to open. One name for the block.

#### UX-33 "Your papers" (minor)

- **Where:** the link on Home, Calendar, Electives and Your account, and its dialog; all sizes.
- **What a student runs into:**
  - "Papers" is the University's word for modules, but everywhere else in the Hub "papers" means past exam papers.
    "Your papers: every Year 2 module" next to "Past papers" reads like a filter for exam papers.
  - It says "every Year 2 module" while Sara hasn't chosen her option, so it claims she sits both EC2020 and IS2184.
  - "Your option (you take one)" is a set of checkboxes, so two can be ticked.
  - "The countdown, your modules and the calendar follow them." is hard to parse.
- **Fix:** call it "Your modules" (button: "Your modules: Year 2, option not picked"), make the option a radio group
  with "Not decided yet", and write the intro as "Pick the modules you sit. Home's countdown, your modules and the
  calendar show only these."

#### UX-34 The module's "Past papers" button opens Google Drive (minor)

- **Where:** a module's overview card ("Start lesson 1 · Past papers ↗"), all sizes; on MT1186 it goes to
  `drive.google.com/drive/folders/…` in a new tab.
- **What a student runs into:** the Hub now files papers by sitting with their examiners' reports, Time me and
  questions, but the most visible "Past papers" button skips all of it for a raw Drive folder. The Files tab then
  shows "Past papers by sitting", "Other papers" and a "Past papers" section holding the Drive link: three headings
  for one thing.
- **Fix:** point the button at the Files tab's sittings (`?tab=files#papers`); keep the Drive folder as a quiet
  "Older exams folder ↗" inside "Other papers", and drop the separate "Past papers" link section.

#### UX-35 Placeholder visuals and third-party logos (minor)

Mohamed's bar is real assets, nothing placeholder. Still on real screens:
- **Newsletter with no issues:** a fake "01 Coming soon" cover beside a display-size "The first issue" headline
  (`screens/ux10-newsletter-empty-390.png`). Use the newsletter illustration or a plain empty state with
  "Get an email when it's out" (the Subscribe action).
- **Grades before any mark:** "Your result appears here as you type" in 64 px display type, plus 18 empty bars.
  Show the real empty state: "Type a mark to see your class", and hide the bars until a mark exists.
- **File thumbnails:** every library card is the same typographic card with the code (UX-27). For PDFs, render the
  first page once at upload/import; for pictures, the picture.
- **Logos:** the University of London crest and the MyClass mark sit in the sidebar on every page, in About's
  "Useful links" and next to BIBF's logo at the bottom of About, though round 8 removed UoL/BIBF logos from Home.
  Use the Hub's own icons (a building, a cap) with text labels.
- **Module visuals:** a year's list mixes three styles: Year 2 has five illustrations and IS2184 as a dark code
  tile; Year 3 is six tan line icons. Until the 7 illustrations arrive, give IS2184 the Year 3 style (one style per
  missing set), not code text.
- Requests and the forum use a line icon for their empty state; the other four use pictures. Fine once the two
  missing illustrations land.

#### UX-36 Search and the library: duplicates, raw names, short titles (minor)

- **Where:** ⌘K and the library; 390 px worst. Screenshot: `screens/ux10-search-dupes-390.png`.
- **What a student runs into:**
  - "variance" returns "ST2133 – Advanced Statistics – Distribution Theory – 2021 Examiners Commentaries, Page 11"
    twice: two library items (`8bc4da34…`, `c5d52bf1…`) for the same file, imported from two folders.
  - On phones both titles cut to "ST2133 - Advanced Statistics - Dis…", so the part that differs (year, kind) is
    hidden, and the snippet is PDF soup ("M W ( t ) = exp µt λ − t").
  - A Year 2 student gets the Year 1 economics textbook first.
  - Library titles are file names: "calculus-concepts-and-methods_compress", "1. Function Characteristics -
    workbook (1)", "ST3134 – … 2019" filed under ST2134; examiners' commentaries are typed "Past paper".
- **Fix:** dedupe on import by content hash; tidy titles at import (drop extensions, "_compress", "(1)"; module
  code, kind, year, zone); type "Examiners Commentaries" as an examiners' report; rank the student's year first; on
  phones, let result titles wrap to two lines and lead with what differs ("2021 examiners' report · ST2133").

#### UX-37 Time me on phones counts down out of sight (minor)

- **Where:** a past paper's page at 390 px (`/library/mt1186-exam-paper-may-2026`).
- **What a student runs into:** "Time me" starts a yellow "0:59:59 left" bar on the Hub's page, but on a phone the
  paper only opens "in your phone's PDF viewer, in a new tab". She sits the paper in that tab; the timer runs where
  she can't see it and nothing tells her when time is up.
- **Fix:** on phones, show the paper inside the Hub under the timer (pdf.js, as on laptops) when the timer runs; and
  at the end, put the time in the tab title, vibrate (`navigator.vibrate`) and, if allowed, notify.

#### UX-38 Career Navigator is 16 screens long on a phone (minor)

- **Where:** `/career`, 390 px: 13,800 px tall ("Where to apply" 5,000 px, "Certificates and courses" 4,300 px,
  "Build the skills" 2,100 px).
- **Fix:** a sticky row of section chips at the top (Apply · Certificates · Skills · Before you apply), show 4
  employers and 3 certificates per filter with "Show all 26", and collapse each role in "Build the skills" to its
  summary.

#### UX-39 Section links wrap under their headings on phones (nit)

- **Where:** Home, Calendar, Electives at 390 px: "Open calendar", "Your papers: every Year 2 module", "All
  modules", "Open the library", "All issues" each drop to a line of their own, indented, in grey.
- **Fix:** below 700 px keep one short link on the heading's line, right-aligned with an arrow ("All →"), and move
  "Your papers" into the block's body; or put "See all" at the foot of each block.

#### UX-40 Copy (nit)

- The forum's tips say "Use `backticks` for formulas and code"; the editors say "$formulas$". Say "Put formulas
  between $ signs, and code in backticks."
- Noora: "I answer from my script" → "Right now I can only point you to modules, lessons, exams and files in the
  Hub."
- A request's own author sees "0 Me too" with "you're already counted": show "1" (the author) or "You asked".
- Numbers: "Questions per student a day … 0 pauses her AI answers." → "Set to 0 to pause her AI answers."
- Results day: "Exam entry deadline: not on the calendar yet. Check the calendar →" links to a calendar it says
  doesn't have it. Say "Not on the calendar yet. Ask your rep." and drop the link.
- About says "the DSBA Resource Hub"; everywhere else is "DSBA Hub".

#### UX-41 Module editor (nit)

- **Where:** Manage → Modules → a module; 390 and 1440 px.
- Focus stays on `<body>` after the editor opens: move it to the module's heading.
- "Undo changes" and "Save" sit at the top of a form that runs through four chapter lists; on a phone they are a
  long scroll away. Make the action bar sticky at the bottom, as the newsletter editor does.
- "Icon" offers Phosphor names ("Chart Scatter", "Terminal Window"), but the 9 modules with illustrations show the
  illustration whatever is picked (`ui/moduleArtSrc.ts`). Show the illustration there with "This module has its
  own picture", and the picker only for the others.

#### UX-42 "Install the app" lives only in Year 1's Start here (nit)

- `useInstall()` is used only by `start/GuideSteps.tsx`. Years 2 and 3 never see Start here on Home, so they never
  learn the Hub installs. Add "Install the app" to the account menu and the More drawer where the browser offers it,
  with the iPhone steps otherwise.

#### UX-43 Small leftovers (nit)

- Electives: the module titles are links 25 px tall under touch ("Microeconomics", "Marketing Management"); give
  them `min-height: 44px` or make the card the link.
- Footer: the first contributor ("Mohamed Alnooh") sits about 12 px lower than the other three at 390 and 820 px.
- Library search placeholder "Search titles, module codes or authors" is cut to "…or autho" at 390 px: "Search
  files" is enough.
- Noora's message time ("18:54") is in the monospace font; use the UI font with tabular numbers.

### What works well and should stay

- **Customize Home:** show, hide and reorder with labelled arrow buttons, live "moved to 3 of 9" announcements,
  focus in and back out to "Customize Home", and the lesson-progress switch where students look for it.
- **Papers by sitting:** "May 2026 · Paper · Examiners' report · Solutions" rows are the clearest view of past
  papers the Hub has had; Gaps turns the missing ones into a to-do list for reps.
- **Search into PDFs:** a result opens the file at the right page, on phones too ("It opens at page 46").
- **Requests:** a calm form with the kind first, a concrete title example, and a toast that says what happens next.
- **Dark mode:** consistent across the new screens, with logos on light plates and readable chips.
- **The lesson progress offer** ("Keep track of what you've watched? Turn on · No thanks") is the right opt-in:
  one line, under the video, never a modal.

---

## Round 3 re-review (13 October 2026)

Reviewer: UI/UX. Build: `feature/backend` at `75626cd` (rounds 2 and 3 merged), on the shared Docker stack
(`:5173`). No application code was changed.

Method: Playwright 1.56 driving the installed Google Chrome, as a guest (fresh, and with a year picked), Years 1, 2
and 3, a student rep and an admin (dev-login, made-up `ux3-…@example.com` addresses). Every listed screen was loaded
at all 16 sizes of the brief with touch emulated (phones also as mobile), and scripted checks ran on each:
sideways scroll and elements past the viewport, text clipped without an ellipsis, touch targets measured by
hit-testing outward from each control's centre (so `::before` extensions count), and the longest real line of
every wrapped text block. Flows were walked by script with screenshots: posting a thread with a photo, uploading a
past paper and two note pictures, the rep's review, starting, editing and publishing a newsletter issue, and the
editor's leave guard. Failures (401, 500, offline) were simulated with route interception, never on the API.

Test data I left: the thread "How do I get the variance from an MGF? (ST2133 week 3)" with a photo and one reply,
three more threads by Huda Al-Mansoori, three published ST2133 uploads (a 2023 Zone A paper, a JPG and a tall PNG
of notes), and the published issue 02 "Exam season special".

**Note for anyone scripting checks:** in Chrome with touch emulated, a Playwright `fullPage` screenshot drops the
touch emulation for the rest of that page (`(pointer: coarse)` turns false and controls shrink to 32 px). Measure
touch targets before taking a full-page screenshot, or on a fresh page.

### Summary

Rounds 2 and 3 fixed every earlier finding that mattered: all six majors (UX-1 to UX-6) and all ten minors are
fixed, and UX-17's nits mostly. The responsive pass held up: no sideways scroll, no element off screen and no
dialog that doesn't fit, across six personas and all 16 sizes, and touch targets are 44 px nearly everywhere.
The newsletter editor is now a form that works on a phone, and its leave guard catches links, ⌘K, Back and reload.
No blockers and no majors are new: 5 minors and 5 nits (UX-18 to UX-27), plus notes for the calendar and Noora
redesigns.

**Top five to fix:**
1. UX-20: the measure, especially Your account's notes at 111–132 characters a line on tablets.
2. UX-21: Home calls a guest without a year "Year 1".
3. UX-22: the app error screen's heading, tab title and way out.
4. UX-18: the six counts still without separators.
5. UX-19: chip counts under AA.

Mini Noora covering content (R-7 notes below) affects more students than any of these, but it belongs to the
redesign.

### Earlier findings

| ID | Was | Now | Evidence |
|---|---|---|---|
| UX-1 | major | **fixed** | A 401 on "Post reply" opens "You were signed out. Sign in again to carry on." with focus in the field (`auth/sessionGuard.ts`); `/me` is re-read on focus. |
| UX-2 | major | **fixed** | Bell → Enter → ArrowDown moves through notifications, Tab reaches "Mark as read" and "Mark all as read", and the last Tab returns to the bell. |
| UX-3 | major | **fixed** | With unsaved edits, a sidebar link, a ⌘K result and in-app Back all open "Leave without saving?"; Back across documents and reload get the browser's own prompt; "Open the issue" becomes "Save and open"; a local copy is offered as "Restore them". |
| UX-4 | major | **fixed** | The editor is a form (details, cover, sections with typed blocks, an icon picker) with Edit / Preview on narrow screens. |
| UX-5 | major | **fixed** | "Upload a file" in the top bar, the More drawer, the footer and ⌘K, all opening the library's upload dialog. |
| UX-6 | major | **fixed** (D1) | Emails are sent through the outbox; Your account says "Every notification shows in the Hub. Choose which ones we also email you." |
| UX-7 | minor | **fixed** (D7) | The year prompt is a card over the page with "I'm not a student" and "Sign in". What remains is UX-21. |
| UX-8 | minor | **fixed** | `Toaster.css` moves toasts to the top on phones while a modal or drawer is open. |
| UX-9 | minor | **fixed** | `ui/internal.ts` `restoreFocus()` falls back to the account button, then `#main`. |
| UX-10 | minor | **fixed** | A 500 reads "The library didn't load. Something went wrong on our side. Try again in a minute."; offline reads "Couldn't reach the Hub. Check your connection and try again." The forum, newsletter and calendar use the same pattern. |
| UX-11 | minor | **fixed** | Buttons, icon buttons, chips, fields, tabs and switches are 44 px under `(pointer: coarse)`. One leftover: UX-23. |
| UX-12 | minor | **fixed** | The phone upload dialog shows only "Choose a file"; Type no longer drops; a suspended student is told up front. |
| UX-13 | minor | **fixed** | "Not confirmed yet. Check with the programme office before you plan around it." No "sample date" copy is left. |
| UX-14 | minor | **fixed** | Section headers wrap below 700 px; "Not added" is `--ink-2`. |
| UX-15 | minor | **fixed** | Roles change through a "Change" button and a dialog; Activity names the issue, thread, file or event. Wording nits: UX-24. |
| UX-16 | minor | **fixed** | Server errors are form alerts, the address is shown in full with "Not there? Check your spam folder.", one name ("Send a new code"), `inputMode="tel"` once a digit is typed. |
| UX-17 | nit | **mostly fixed** | Fixed: zero counts, guest composer, phone moderation tiles, the earlier smooth scrolls, "Hide Mini Noora" in her chat, `demo/` paths. Open: the library still says "A student rep decided not to publish this file." (`FileViewerPage.tsx:115`, `YourUploads.tsx:59`) where the rest says "Not published", and three new smooth scrolls ignore reduced motion (both in UX-26). |
| Field borders (WCAG 1.4.11) | — | **fixed** | `--control-border` (3.23:1 light, 3.45:1 dark) is used for fields and selects. |

### Responsive results

Six personas × the 16 sizes of the brief (phones 360×780, 390×844, 430×932, 844×390; tablets 768×1024, 820×1180,
1024×768, 1180×820, 1366×1024; laptops 1280×800, 1366×768, 1440×900, 1536×864; monitors 1920×1080, 2560×1440,
3440×1440), 845 page loads, touch emulated throughout:

- **Sideways scroll: none.** No page scrolls sideways and no visible element reaches past the viewport, at any size,
  for any persona (Home, modules, a module, the library, a picture, a PDF and a link item, the forum, a thread, the
  composer, the newsletter, an issue, the editor, the calendar, Career Navigator, grades, About, Your account,
  moderation, People, the style guide and the 404).
- **Dialogs on short screens: all fit.** At 844×390, 360×780 and 1024×768 the sign-in, report, add-event, delete
  account, role and palette dialogs, the notifications popover, the event drawer, the More drawer and Mini Noora's
  chat stay inside the screen, scroll inside when taller, keep their actions visible, and take focus.
- **Touch targets: one leftover on a real screen** (UX-23). Every page-level control, menu, popover and dialog
  measured 44 px or more under touch. The icon rail scrolls at 844×390, so Grades, the theme and the account stay
  reachable.
- **Measure:** see UX-20.

### New findings

| ID | Severity | Title |
|---|---|---|
| UX-18 | minor | Counts that still print without a thousands separator (**fixed** `5a19218`) |
| UX-19 | minor | Chip counts are under AA contrast in the light theme (**fixed** `5a19218`) |
| UX-20 | minor | Lines run past 75 characters: 58ch is loose for small text, and some notes have no measure (**fixed** `5a19218`: 54ch and 50ch; the longest lines measured are 74 characters) |
| UX-21 | minor | A guest without a year, or "not a student", is labelled "Year 1" while the switcher shows none (**fixed** `5a19218`: "Showing Year 1" and "Pick your year") |
| UX-22 | minor | The app-level error screen has no heading, keeps the old tab title and offers only Reload (**fixed** `5a19218`) |
| UX-23 | nit | Draft titles on the newsletter page are 32 px touch targets |
| UX-24 | nit | Activity wording: library actions don't say "library file", and punctuation varies |
| UX-25 | nit | Editor details: "Cancel" in the leave dialog, and a preview pane the keyboard can't scroll |
| UX-26 | nit | Three smooth scrolls ignore reduced motion; one "decided not to publish" left |
| UX-27 | nit | Picture uploads get a document thumbnail instead of the picture |

#### UX-18 Counts that still print without a thousands separator (minor)

- **Where:** the forum header, the library and the module's Files tab, all sizes. Checked by feeding large counts
  through route interception at 360 px and 1440 px.
- **What a student sees:** tabs, chips, badges and download counts read "12,345" and "1,234,567", but next to them
  the forum says "1204 replies today" and "3456 questions are waiting for a first reply", and the library says
  "23456 files". The layout holds; only the format differs.
- **Where in the code:** `ForumPage.tsx:98` and `:103`, `LibraryPage.tsx:416` and `:482`, `ModuleFiles.tsx:134` and
  `:147` render the raw number in a `u-tabular` span. `forum/components/RollingNumber.tsx` (votes and reply counts)
  does the same.
- **Fix:** use `formatCount()` or `<Count>` from `src/ui` in those six places and inside `RollingNumber`.

#### UX-19 Chip counts are under AA contrast in the light theme (minor)

- **Where:** chips with a count, for example the track chips on Career Navigator; any size, light theme. axe-core
  flags it (3.63:1 for 14 px text).
- **What a student sees:** the number beside each chip label is pale grey on white.
- **Fix:** `.ui-chip__count { color: var(--ink-2); }` in `ui/Chip.css` (7.74:1). Tab counts already use `--ink-2`.

#### UX-20 Lines run past 75 characters (minor)

- **Where:** measured from the longest real line of each wrapped block, at every size.
- **What a student reads:**
  - `--measure: 58ch` gives 76–82 characters in practice, not "about 76", because small text and text with short
    words fit more per `ch`: a thread's post (81 at 768–1180 px), the grades notes (78–80), Career Navigator's notes
    (76–82), About (76–79). The issue's lead paragraph at `--measure-serif: 54ch` reaches 77.
  - Some notes have no measure at all: Your account's sign-in note ("Add the other one too, so you can still sign
    in…", `.acct-note`) runs to 111–132 characters at 768–1180 px, and the module page's files description
    (`.mod-res__desc`) to 78.
- **Fix:** `--measure: 54ch` and `--measure-serif: 50ch` (or a separate `--measure-small` for 12–14 px notes), and
  `max-width: var(--measure)` on `.acct-note` and `.mod-res__desc`. Re-run the line check after the change. (The
  forum list's one-line excerpts are truncated with an ellipsis, so they are fine.)

#### UX-21 A guest without a year is labelled "Year 1" (minor)

- **Where:** Home, a first visit before a year is picked, or after "I'm not a student"; 390 px and 1440 px.
- **What a student sees:** the greeting carries a "Year 1" badge and the hero says "EC1002 Economics exam in 6 days",
  while the year switcher in the top bar (phones) or the sidebar (laptops) shows no year at all. After "I'm not a
  student" the page keeps saying "Year 1". A Year 2 student who pressed "Not now" reads Year 1's exam as theirs.
- **Note:** the round 3 fix made Home's widgets agree with each other (all Year 1); what's left is that the page
  presents a default as the student's own year. Whether "not a student" should show every year is Mohamed's open
  product call.
- **Fix:** until a year is chosen, label the badge "Showing Year 1" (or "Year 1 for now"), and put a "Pick your
  year" link in the hero's subline. If the product call goes to "all years", show that instead.

#### UX-22 The app-level error screen (minor)

- **Where:** `shell/AppCrashed.tsx`, reached by breaking the module catalogue response; 390, 1440 and 3440 px, light
  and dark.
- **What a student sees:** a clean card, "DSBA Hub hit a problem. Something went wrong while showing the Hub. Reload
  the page to carry on." with "Reload the page". It fits every size and both themes. But:
  - the tab still says "Library – DSBA Hub";
  - the title is a `<p>` (EmptyState), there is no heading or `main` landmark, and focus stays on `<body>`, so a
    screen reader user hears nothing;
  - if the same data breaks again, Reload is a loop with no way out, and there is no brand mark to say where they
    are.
- **Fix:** set `document.title = 'Something went wrong – DSBA Hub'`, render the title as an `<h1>` inside `<main>`,
  focus it on mount, add the HubLogo, and add a second action "Go to Home" (a plain `<a href="/">`, so it reloads).

#### UX-23 Draft titles on the newsletter page are 32 px touch targets (nit)

- **Where:** `/newsletter`, the drafts panel a rep sees; 360, 390 and 430 px with touch.
- **What a rep runs into:** the draft's title is the only link to it, 32 px tall.
- **Fix:** `@media (pointer: coarse) { .nl-drafts__name { display: inline-flex; align-items: center; min-height: 44px; } }`
  in `NewsletterPage.css`, or make the whole draft row the link.

#### UX-24 Activity wording (nit)

- **Where:** People → Activity, all sizes.
- **What an admin reads:** the round 3 labels name what was acted on, which is the main thing. Two rough edges:
  - library actions read "published “ST2133 notes”" and "rejected “…”", while newsletter actions say "published the
    newsletter issue “…”". Next to each other, the library line reads like a newsletter.
  - Punctuation varies: "added an event: “X”" but "edited an event “X”" and "deleted an event “X”"; "hid a thread:
    “X”" but "hid a reply in “X”". A thread or event without a title would end in a bare colon.
- **Fix:** in `features/admin/audit.ts`, "published the library file “X”", "rejected the library file “X”",
  "removed the library file “X”"; one pattern for events ("added the event “X”", "edited the event “X”"); and
  drop the colons.

#### UX-25 Editor details (nit)

- **Where:** `/newsletter/<slug>/edit`, rep, 1440 px.
- "Leave without saving?" offers "Cancel" and "Leave without saving". "Cancel" could mean cancel the edits. Use
  "Keep editing" (`ConfirmDialog`'s cancel label).
- The preview pane (`.nl-editor__side`) scrolls on its own but can't take focus, so a keyboard user can't scroll it
  (axe: scrollable-region-focusable). Give it `tabIndex={0}`, `role="region"` and `aria-label="Preview"`.

#### UX-26 Reduced motion and one old word (nit)

- `GradesPage.tsx:281`, `CalendarPage.tsx:129` and `StyleGuidePage.tsx:185` call `scrollIntoView({ behavior:
  'smooth' })` whatever `prefers-reduced-motion` says (`base.css` only resets CSS `scroll-behavior`). Use the
  pattern of `LessonsTab.tsx`: `behavior: reduced ? 'auto' : 'smooth'`.
- The library still says "A student rep decided not to publish this file." (`FileViewerPage.tsx:115`,
  `YourUploads.tsx:59`), where every other place says "Not published" (UX-17).

#### UX-27 Picture uploads get a document thumbnail (nit)

- **Where:** the library grid, "New this week" and "More from this module", any size.
- **What a student sees:** a JPG or PNG of handwritten notes shows the same printed-page card as a PDF, so the one
  kind of file that could be recognised at a glance isn't. Its own page previews it well (round 2, D9).
- **Fix:** for `format` jpg, png or webp, draw the card's thumbnail from the picture (the same short-lived inline URL
  the viewer uses), with the printed card as the fallback.

### For the redesigns (R-3 and R-7)

Not findings: what students most need from the two features being redesigned, from what this pass saw.

**R-3, the calendar.** On a 390 px phone the page is about 3,700 px long and shows the same few events three
times: the "Next up" board, the upcoming list, the month grid's dots and then the month's agenda. A Year 2 student's
"Next up" is a mock exam marked "Not confirmed yet", and their first real exam is a line of small print below it.
What they need first:
- **One answer at the top: "your next exam" and "what's due this week"**, for their year (and their zone, once
  events carry it), with confirmed dates first.
- **Time and place on every exam.** Most events have neither, so the calendar can't replace the timetable yet
  (content gap noted in STATUS).
- **One list on phones,** with the month grid as an option rather than a second copy.
- **The rep's form stays as it is:** it fits 844×390 and scrolls with its actions visible. Keep it.
- Two contrast leftovers to drop in the redesign: the selected "My year / All years" segment and the "break" and
  "term" type chips (3.09:1).

**R-7, Noora.** Her chat works at every size (a sheet on phones, a panel beside her elsewhere, fits 844×390, takes
focus, "Hide Mini Noora" in its header). What gets in students' way is where she stands:
- **She covers content by default.** At 1440 px she sits over Home's "Your modules" dates; at 1280 px over the
  forum's reply counts and times (`screens/ux3-noora-covers-forum-l1280.png`); at 390 px over the editor's date
  picker and the Activity times; at 360 px her hint covers the exam timeline.
- **Landscape phones get the laptop-size mascot** (the phone size switches at 700 px wide), so at 844×390 she takes
  about 40% of the screen's height.
- **On wide monitors she is detached:** at 3440 px the shell is centred at 2000 px, but she stands at the screen's
  far right edge.
- What students need: a dock that never covers the page (a button in the top bar or tab bar, or a side panel on
  laptops); suggestions for the page they are on (the chat already offers "When is my next exam?"); and answers
  that link into the Hub, which she does today.

---

# Round 1 (10 October 2026)

Reviewer: UI/UX. Build: `feature/backend` at `525962c` (working tree as of 10 Oct, 20:05), against the shared dev API
and the lead's web server on `:5173`. No application code was changed.

Method: Playwright (Chromium 1.56) at 1440×900, 768×1024 and 390×844, light and dark, as a guest, a new student
(signed up by email and by phone with real codes from the mail and SMS sinks), a returning student, a student rep
and an admin. Slow, failing (500, 401, 429, offline) and empty answers were simulated with route interception, never
on the shared API. Contrast was computed from the tokens and with an in-page scan of the new screens; keyboard paths
were walked with Tab, arrows and Esc. Screenshots are in
`/tmp/claude-0/-home-claude-dsba/331caa53-7cba-5bfe-8500-672e2c76573d/scratchpad/uiux/shots/` (named `shots/…` below;
the contact sheets `sheet-*.png` are one folder up). My test accounts are named `ux-…` (ux-student, ux-rep,
ux-admin by dev-login; ux-new-a, ux-new-b, ux-kb and ux-hamad, the last with +973 3600 1102, through real codes).
I published the "Launch edition" draft and left one ST2195 thread with two replies, two uploads (one published, one
rejected with a note) and a report. ux-Hamad's deliberately spammy reply in that thread is still visible (its report
was resolved without hiding it): hide it before any demo.

## Summary

The new account, upload, moderation and people screens look like they were always part of DSBA Hub: they reuse the
tokens, panels, dialogs, badges and empty states, read well in both themes, and nothing overflows at 390 px.
Sign-in is the strongest part: one field for an email or a Bahraini number, a code step that handles paste, wrong,
expired and resent codes with clear messages, a short profile step, and the action the student tried (star, vote,
reply, upload, report, react) carries on once they are signed in. Reading stays open to guests everywhere.
The weak spots are at the edges of a session and in the rep tools: a session that ends while a tab is open leaves
the student looking signed in but unable to do anything; the notifications popover can't be used with a keyboard;
the newsletter editor is raw JSON and throws away unsaved edits when the rep presses its own "Open the issue"; the
"Contribute" button on every page still sends students to GitHub instead of the new upload; and Your account offers
email settings for emails that are never sent. No blockers, 6 majors, 10 minors and a group of nits.

| ID | Severity | Owner | Title |
|---|---|---|---|
| UX-1 | major | frontend-accounts (+ lead: `src/api/queryClient.ts`) | A session that ends in an open tab is a dead end: "Sign in to do this." with no way to sign in |
| UX-2 | major | frontend-accounts (`ui/Menu.tsx`) + frontend-community | Notifications can't be used by keyboard; Tab in any menu throws focus to the top of the page |
| UX-3 | major | frontend-content | Newsletter editor loses unsaved edits on any in-app link, including "Open the issue" next to Save |
| UX-4 | major | frontend-content (+ content for the format) | Newsletter editor asks student reps to write JSON, which no other screen does and phones can't handle |
| UX-5 | major | frontend-accounts (shell) + frontend-content (search) | "Contribute" on every page still goes to GitHub; search for "upload" finds nothing |
| UX-6 | major | accounts + frontend-accounts + content | Email settings promise emails that are never sent; the newsletter switch silences in-app notifications |
| UX-7 | minor | frontend-content (onboarding) | First visit to any shared link is blocked by the year picker, with no "not a student" or "sign in" way out |
| UX-8 | minor | frontend-accounts (`ui/Toaster`) | On phones, toasts sit on top of dialogs and cover the field you must fill (delete account, upload) |
| UX-9 | minor | frontend-accounts | After signing in from the Sign in button, keyboard focus is dropped on the page body |
| UX-10 | minor | frontend-library, frontend-content, frontend-community | Error states blame the connection when the server failed, with two title patterns |
| UX-11 | minor | frontend-accounts (`ui`) | 32 px controls throughout the new phone flows |
| UX-12 | minor | frontend-library | Upload dialog polish: misaligned Type field, "Drag a file here" on phones, "0% (1 KB of 1 KB)", suspended users find out last |
| UX-13 | minor | frontend-content (calendar) | Rep-entered unconfirmed events are called "sample dates" that "follow last year's pattern" |
| UX-14 | minor | frontend-accounts | Your account on phones: squeezed "Where you're signed in" header; "Not added" below AA |
| UX-15 | minor | frontend-accounts (+ content, community for audit data) | People: the role menu fires a confirmation on the first arrow key; some Activity lines don't say what |
| UX-16 | minor | frontend-accounts | Sign-in polish: server errors mark the address as wrong, masked address hides typos, two names for "resend" |
| UX-17 | nit | several (listed) | Grouped nits: wording, zero counts, guest composer, phone moderation header, motion, Mini Noora |

---

## Findings

### UX-1 A session that ends in an open tab is a dead end (major)

- **Owner:** frontend-accounts (`src/auth/AuthProvider.tsx`), lead (`src/api/queryClient.ts`, if the handler goes there).
- **Where:** any page with a write, any viewport and theme, a signed-in student whose session has ended: they pressed
  "Sign out other devices" on another device, added or changed their email or phone ("To be safe, your other devices
  were signed out"), or the session expired. Reproduced by answering writes with the API's own
  `401 {"code":"unauthenticated","message":"Sign in to do this."}` on `/forum/st2133-2023-q3-…`.
- **What happens:** the sidebar still shows "ux-Sara M., Year 2", so there is no Sign in button anywhere. Posting a
  reply shows "Sign in to do this." in red under the composer; a vote shows the toast "Your vote wasn't saved / Sign in
  to do this."; an upload says "You were signed out. Sign in again, then retry." Nothing opens the sign-in dialog. `/me`
  is never re-read during a visit (`staleTime: 60_000`, `refetchOnWindowFocus: false`), so the page keeps believing
  the student is signed in until they reload. The obvious way out, account menu → Sign out → Sign in, runs
  `clearPersonalStorage()`, which deletes the thread draft they were writing.
- **Why it matters:** the account page actively encourages signing out other devices (lab computers), and changing a
  sign-in method signs out every other device, so students will hit this on their phone the same day. It looks like
  the Hub is broken, and the work they typed is at risk.
- **Screenshots:** `shots/ex01-reply-after-session-ended.png`, `shots/ex02-vote-after-session-ended.png`.
- **Fix:**
  - In `AuthProvider`, subscribe to both caches and treat any 401 while `me` is set as "session ended":
    ```ts
    useEffect(() => {
      const ended = (e: unknown) => {
        if (e instanceof ApiError && e.status === 401 && qc.getQueryData(ME_KEY)) {
          qc.setQueryData(ME_KEY, null);          // the UI shows a guest again: Sign in buttons come back
          void resetPersonalQueries(qc);          // but keep drafts: no clearPersonalStorage() here
          setRequest({ reason: 'You were signed out. Sign in again to carry on.' });
        }
      };
      const a = qc.getMutationCache().subscribe((ev) => ev.type === 'updated' && ev.action.type === 'error' && ended(ev.action.error));
      const b = qc.getQueryCache().subscribe((ev) => ev.type === 'updated' && ev.action.type === 'error' && ended(ev.action.error));
      return () => { a(); b(); };
    }, [qc]);
    ```
    Calls made outside TanStack Query (`sendFile` in the upload dialog) can call the same `ended()` through the
    context.
  - Where an action already uses `requireAuth(reason, retry)` (reply, thread, vote, star, react, report), call it again
    on a 401 so the action resumes after the new sign-in, as it does for guests.
  - Re-read `/me` when the tab becomes visible again: `refetchOnWindowFocus: true` on the `ME_KEY` query only.

### UX-2 Notifications can't be used by keyboard; Tab in any menu throws focus to the top of the page (major)

- **Owner:** frontend-accounts (`src/ui/Menu.tsx`, the design system), frontend-community (`NotificationsMenu.tsx`).
- **Where:** the bell, every page, desktop and tablet; signed in with several notifications.
- **What happens:** Enter on the bell opens the popover and focuses the first notification. Arrow keys do nothing
  (the popover is a `role="dialog"` panel, so `Menu` skips its arrow handling), and Tab closes the panel
  (`Menu.tsx:116-120`: `if (e.key === 'Tab') { setOpen(false); return; }`) without returning focus, so focus lands on
  "Skip to content" at the top of the document. A keyboard user can open only the first notification: the others,
  each "Mark as read" button and "Mark all as read" are out of reach. The same Tab code closes the account menu,
  the sort menus and the post menus and drops focus at the top of the page.
- **Why it matters:** notifications are a headline feature of this release, and the brief asks for keyboard paths
  through the main flows. (The prototype had the same `Menu` code, but its notifications were pretend.)
- **Walk:** focus the bell, Enter: focus on "New issue of The DSBA Newsletter: The pilot". ArrowDown ×8 and End: focus
  stays there. Tab: the panel closes and focus is on "Skip to content". Esc works (focus back on the bell).
- **Screenshot:** `shots/nt01-notifications-desk.png`.
- **Fix:** in `Menu.tsx` `onPanelKeyDown`:
  ```ts
  if (e.key === 'Tab') {
    if (isMenu) { e.preventDefault(); close(true); return; }        // menus: leave, focus back on the trigger
    const els = getFocusable(panelRef.current);                       // popovers: Tab moves inside the panel
    const atEnd = e.shiftKey ? document.activeElement === els[0] : document.activeElement === els[els.length - 1];
    if (atEnd) { e.preventDefault(); close(true); }                   // and leaves from either end, back to the trigger
    return;
  }
  ```
  In `NotificationsMenu`, also let ArrowUp/ArrowDown move between notification links (roving focus), so a long list
  isn't 2 Tab stops per item.

### UX-3 The newsletter editor loses unsaved edits on any in-app link (major)

- **Owner:** frontend-content (`src/features/newsletter/IssueEditorPage.tsx`).
- **Where:** `/newsletter/launch-edition/edit`, rep, desktop light.
- **What happens:** I changed the title (the header shows "Unsaved changes"), then pressed "Open the issue", the
  button right next to Save. The issue page opened with no warning; Back showed the old title. The page only guards
  reload and tab close (`beforeunload`, line 177); every in-app link (sidebar, "Open the issue", the newsletter
  breadcrumb, a notification) discards the edits silently.
- **Why it matters:** writing an issue takes a long time, the preview button invites exactly this click, and the
  editor has no draft copy to recover from.
- **Screenshot:** `shots/ed02-dirty-header.png`.
- **Fix:** keep a local copy while dirty (`hub.mine.newsletter.<slug>`, which `clearPersonalStorage` already removes
  on sign-out) and offer "You have unsaved changes from earlier: Restore / Discard" when the editor opens. While
  dirty, turn "Open the issue" into "Save and open" (or open it in a new tab), and catch in-app navigation with a
  capture-phase click listener on `a[href]` that asks "Leave without saving? Your changes to issue 01 will be lost."
  (`useBlocker` needs a data router; the app uses `BrowserRouter`).

### UX-4 The newsletter editor asks student reps to write JSON (major)

- **Owner:** frontend-content (`IssueEditorPage.tsx`); content (the sections format, which CQ-4 in
  `code-quality.md` also flags as unschema'd).
- **Where:** `/newsletter/<slug>/edit`, rep, all viewports.
- **What happens:** title, date, address, standfirst, summary and editors are proper fields, but the issue itself, its
  cover and every section (`"blocks": [{ "type": "p", "text": … }]`, icon names like `"ChartLineUp"`, image paths like
  `"demo/news/cfa-research-challenge.jpg"`) are typed into two monospace textareas. One stray character empties the
  preview ("The preview is waiting for valid JSON") with a message that sometimes has no line number. On a phone the
  JSON box is 390 px wide with long lines cut off.
- **Why it matters:** this is the one new screen that doesn't look like the rest of the Hub, and the reps who run the
  newsletter are students, not developers. The likely outcome is that only one person can publish, or issues break.
- **Screenshots:** `shots/n04-editor-desk.png`, `shots/ed01-json-error.png`, `shots/n06-editor-phone-json.png`.
- **Fix:** a section list editor built from the existing fields: each section is a panel with Label, Title, an icon
  picker (the 10 or so icons in `sectionIcons.ts`) and a list of blocks; each block is a typed form (Paragraph:
  TextArea with the same markdown subset as `RichText`; Image: upload plus alt text; Quote; Link list), with Add,
  Move up/down and Delete. Keep "Edit as JSON" as an advanced toggle for what the form can't do yet. The live preview
  already works and should stay. If that is too much for this release, at least ship one section template per
  section type ("Add a news story", "Add deadlines"), and make phones read-only with "Edit on a computer".

### UX-5 "Contribute" on every page still goes to GitHub; search for "upload" finds nothing (major)

- **Owner:** frontend-accounts (`shell/TopBar.tsx:48`, `shell/MobileNav.tsx:13`, `shell/SiteFooter.tsx:20`),
  frontend-content (`features/search/search.ts:134`).
- **Where:** the top bar on desktop and tablet ("Contribute", GitHub icon), the footer and the phone's More drawer
  ("Contribute a resource"), and ⌘K: "share notes" offers only "Contribute a resource" (GitHub, opens
  `github.com/…/issues/new`), and "upload" gives "No results".
- **Why it matters:** students can now share files in the Hub with review by a rep, which the About page explains
  well. But the most visible "share something" button on every page sends them to GitHub, where they need an account
  and a repository issue form. The new upload flow is only reachable from the library.
- **Screenshots:** `shots/k10-palette-upload.png`, `shots/k11-palette-share-notes.png`, the top bar in
  `shots/l01-library-guest-desk.png`.
- **Fix:** relabel the top-bar button "Upload a file" (UploadSimple icon) and open the upload dialog (for example by
  navigating to `/library?upload=1`, which `LibraryPage` opens through `requireAuth`). Do the same in the More drawer
  and the footer. Add a palette action "Upload a file" with keywords `upload`, `share notes`, `share a file`,
  `past paper`, `contribute`, and take "share notes" off the GitHub action. Keep GitHub as "Suggest a change to the
  Hub" on the About page and in the footer.

### UX-6 Email settings promise emails that are never sent (major)

- **Owner:** accounts (whether and when notification emails are sent), frontend-accounts (`AccountPage.tsx:221-244`,
  `SignInDialog.tsx:241`), content (`services/newsletter.py:233-246`, `components/IssueActions.tsx`).
- **Where:** Your account → Emails; the sign-in dialog's fine print; the publish confirmation.
- **What happens:**
  - Your account says "Notifications always show in the Hub. Choose what we also email you." with two switches,
    "Replies and reviews" and "New newsletter issues", both on for every new account. A phone-only student is told
    "These go to your email address. Add one above to get them." But nothing in the API sends a notification email
    (only sign-in codes and account notices go out; `notify()` only writes a row).
  - "New newsletter issues" is really the in-app switch: `publish()` skips everyone with `newsletter_emails: false`, so
    turning off the "email" also removes the notification in the Hub, which the same section says "always shows".
  - The sign-in fine print says "We only use it to sign you in and, if you want, to tell you about replies", while the
    settings are on by default.
- **Why it matters:** students will rely on an email that never comes ("I'll get an email when someone answers"), and a
  student who turns off newsletter emails silently stops seeing new issues. It is also what a student consents to when
  they sign up.
- **Screenshots:** `shots/a12-account-emails-phone-light.png`, `shots/s01-signin-open-desk.png`,
  `shots/n07-publish-confirm.png`.
- **Fix:** decide whether notification emails ship in this release.
  - If not: rename the section "Notifications", keep one honest switch "Tell me when a new issue of The DSBA
    Newsletter is out (in the Hub)", drop the email wording and the "add an email to get them" note, and change the fine
    print to "We only use it to sign you in."
  - If yes: send them (one message per person, as in finding 17 of `security-design.md`), split the newsletter
    preference into in-app and email, make email opt-in (ask on the profile step: "Email me when someone replies"),
    and keep the fine print matching the default.

### UX-7 First visit to a shared link is blocked by the year picker (minor)

- **Owner:** frontend-content (`src/features/onboarding/Onboarding.tsx`).
- **Where:** any URL on a browser that has never chosen a year; checked with a forum thread link at 390 px and the
  forum at 768 px dark.
- **What happens:** "Welcome to DSBA Hub" covers the page and can't be closed (Esc and the scrim do nothing until a
  year is chosen, lines 257-260). There is no "Not a current student" (which the profile step offers), no "Sign in"
  for a returning student on a new computer, and the footer says "switch years any time from the sidebar", which
  phones don't have.
- **Why it matters:** with real content, most first visits will come from a link shared in a WhatsApp group. The link
  opens to a wall instead of the thread. Staff, alumni and applicants have to pretend to be in a year. (The gate is
  from the prototype, but it costs more now.)
- **Screenshots:** `shots/ob01-shared-link-fresh-phone.png`, `shots/s20-forum-fresh-guest-tab-dark.png`.
- **Fix:** show the picker as a blocking dialog only on Home; on any other page show it as a dismissible bottom sheet
  or banner over the content. Add "Not a current student" (no year: every year is shown) and "Already have an
  account? Sign in" (the cohort then comes from the account). Change the footer to "You can change your year any time
  from the year switcher" (top bar on phones).

### UX-8 On phones, toasts sit on top of dialogs and cover their fields (minor)

- **Owner:** frontend-accounts (`src/ui/Toaster.css`, tokens `--z-toast: 80` over `--z-overlay: 60`).
- **Where:** 390 px. Adding an email and then pressing Delete account: "Email address added" covers the "Type DELETE to
  confirm" field for 5 s. Signing in from "Upload a file": "Signed in as ux-Aisha K." covers the Type field of the
  upload form that just opened.
- **Why it matters:** dialogs are bottom sheets on phones, so the toast lands exactly on their fields and buttons.
- **Screenshots:** `shots/a10-delete-dialog-phone-dark.png`, `shots/l12-upload-after-signin-phone-toast.png`.
- **Fix:** while a dialog is open, move the toaster to the top on small screens:
  `body:has(.ui-modal, .ui-drawer) .ui-toaster { top: calc(env(safe-area-inset-top) + var(--sp-8)); bottom: auto; }`
  in the `max-width: 699px` block. And skip the "Signed in as …" toast when sign-in resumes an action that opens a
  dialog: the dialog is the confirmation.

### UX-9 After signing in from the Sign in button, focus is dropped on the page body (minor)

- **Owner:** frontend-accounts (`src/ui/internal.ts` `useOverlay`, line 159; `src/auth/SignInDialog.tsx`).
- **Where:** sidebar or top-bar "Sign in", then the whole flow by keyboard.
- **What happens:** focus returns to the opener only if it still exists; the Sign in button has been replaced by the
  account button, so focus goes to `<body>` and a screen reader user starts again from the top. (When the opener
  survives, as with Upvote, focus returns to it correctly.)
- **Evidence:** no screenshot (focus position); the scripted walk logged `document.activeElement === <body>` after
  "Save and continue".
- **Fix:** give `useOverlay` a fallback: when the opener is gone, focus `[data-hub="profile"]` (the account button
  that replaced Sign in) or else `#main`.

### UX-10 Error states blame the connection when the server failed (minor)

- **Owner:** frontend-library (`LibraryPage.tsx:263`, `FileViewerPage.tsx:82`, `ModuleFiles.tsx:103`,
  `UploadsQueue.tsx:114`, `modules/ModulePage.tsx:244`), frontend-content (`NewsletterPage.tsx:280`, `IssuePage.tsx:307`,
  `LatestIssueCard.tsx:36`, `calendar/UpcomingEvents.tsx:59`, `home/NewInLibrary.tsx:52`, `career/CareerPage.tsx:68`),
  frontend-community (`NotificationsMenu.tsx:137`).
- **Where:** every data page with the API answering 500 (desktop, light and dark).
- **What happens:** every page has a proper error state with "Try again", which is good. But most say "Check your
  connection, then try again." for a server error, while the forum, thread, calendar page and moderation say
  "Something went wrong on our side." Titles alternate between "Couldn't load the forum" and "The library didn't
  load".
- **Why it matters:** students on campus Wi-Fi will waste time on their connection when the Hub is down.
- **Screenshots:** `sheet-err-1.png`, `sheet-err-2.png` (and `shots/e-err-*.png`).
- **Fix:** one helper, for example `loadProblem(error)` in `src/api/errors.ts` (lead) or `src/ui`, returning "Check your
  connection and try again." only for `code === 'network'` and "Something went wrong on our side. Try again in a
  minute." otherwise; and one title pattern ("The library didn't load").

### UX-11 32 px controls throughout the new phone flows (minor)

- **Owner:** frontend-accounts (`src/ui/Button.css`, `src/ui/IconButton.css`).
- **Where:** 390 px. Measured: dialog Close 32×32; "Resend code" 166×32 and "Use a different email or number" 235×32;
  account Change/Remove 77×32; notification "Mark as read" 32×32; moderation Preview/Download/Edit details/Reject/
  Publish 32 px tall; reactions 62×36; top-bar Sign in 70×32; "Your uploads" Delete 69×32.
- **Why it matters:** these pass WCAG 2.2 AA (24 px) but are under the 44 px that phones need, and several sit next to
  each other (Reject beside Publish, Change beside Remove).
- **Screenshots:** `shots/s13-code-step-phone.png`, `shots/m05-moderation-phone-light-uploads.png`.
- **Fix:** `@media (pointer: coarse) { .ui-button--sm { --btn-h: 40px; } .ui-iconbutton--sm { width: 40px; height: 40px; } }`,
  or at least for the controls listed.

### UX-12 Upload dialog polish (minor)

- **Owner:** frontend-library.
- **Where and what:**
  - When Module has an error, the Type select next to it stretches and drops below its label (the row is a grid with
    `align-items: stretch`). Fix: `.lib-form__row { align-items: start; }` (`UploadDialog.css:71`).
    `shots/l06-upload-dialog-errors.png`.
  - Phones read "Drag a file here … or Choose a file". Show the drag line only for `(pointer: fine)`.
    `shots/l12-upload-after-signin-phone-toast.png`.
  - The progress line reads "Uploading… 0% (1 KB of 1 KB)" at the start, because `formatSize` rounds 0 up to 1 KB
    (`kinds.ts:158`). Hide the "(x of y)" part until bytes have moved. `shots/l08a-upload-progress.png`.
  - A suspended student can open the dialog and fill it in; the refusal only comes after Send for review. The forum
    disables posting up front with a sentence; do the same here ("Your account is suspended, so you can't upload.").
    `shots/su04b-suspended-upload-phone.png`.

### UX-13 Rep-entered unconfirmed events are called "sample dates" (minor)

- **Owner:** frontend-content (calendar).
- **Where:** a rep adds an event with "Not confirmed yet" ticked ("Students see it marked as a sample date until you
  untick this", `EventFormDialog.tsx:196`); students then read in the event drawer "Sample date. It follows last year's
  pattern and is not confirmed" (`EventDrawer.tsx:176`), and the subscribe dialog speaks of "Sample dates"
  (`SubscribeDialog.tsx:99`).
- **Why it matters:** "sample" and "last year's pattern" described the prototype's generated dates. For a date a rep
  typed in, it is wrong, and "sample" sounds like fake data.
- **Also:** in the forum and Home "Coming up" widgets, "Not confirmed" wraps to two lines next to the type and the
  countdown (`shots/f12-thread-posted.png`, right column).
- **Fix:** "Not confirmed yet. Check with the programme office before you plan around it." / "Students see it marked
  as not confirmed until you untick this." / "Dates that aren't confirmed are marked in their notes." Keep "Not
  confirmed" on one line (`white-space: nowrap`) or put it under the title.

### UX-14 Your account on phones (minor)

- **Owner:** frontend-accounts (`AccountPage.tsx:302-313`, `AccountPage.css:46`, `ui/SectionHeader.css`).
- **Where and what:**
  - "Where you're signed in": the "Sign out other devices" action keeps its full width beside the header, so the
    title and description are squeezed into a 140 px column of six lines. Wrap the header below 700 px
    (`.ui-section-header { flex-wrap: wrap; }`, action on its own line), or put the button under the device list.
    `shots/a05c-devices-header-squeezed-phone.png`.
  - "Not added" uses `--ink-3`: 3.64:1 on white, under 4.5:1 for 14 px text. Use `--ink-2` (7.74:1).

### UX-15 People: role menu and Activity log (minor)

- **Owner:** frontend-accounts (`features/admin/PeoplePage.tsx`, `features/admin/audit.ts`); content and community for
  the audit data.
- **Where and what:**
  - The role is a native `<select>` whose `change` opens "Make … a student rep?". With the keyboard, the first
    ArrowDown already changes the value and opens the dialog, so an admin can't browse the options.
    `shots/p11-role-select-arrowdown.png`. Use a "Change role" button that opens a dialog with the three roles as
    radio cards (the same pattern as the cohort picker), and confirm there.
  - Activity says "published a newsletter issue", "edited a newsletter issue", "resolved a report" without saying
    which (also ST-9 in `student-test.md`). Put the title in the audit data for `newsletter.*` and the target title
    for `report.resolve`, and use it in `describeAudit`. `shots/p04-activity.png`.

### UX-16 Sign-in polish (minor)

- **Owner:** frontend-accounts (`src/auth/SignInDialog.tsx`, `src/auth/CodeEntry.tsx`).
- **Where and what:**
  - A 500, a lost connection or the rate limit is shown as a field error: the email turns red and `aria-invalid`,
    though the address is fine (`SignInDialog.tsx:138`). Keep field errors for `invalid_identifier` and
    `sms_unavailable`; show the others as the form alert the profile step already uses (`signin__alert`).
    `shots/s17-start-500-phone.png`.
  - The code step says "Sent to u•••@example.com". The student typed the address on this screen; show it in full
    (`pending.identifier`) so a typo is visible, and add "Not there? Check your spam folder." for email codes.
    `shots/s06-code-wrong.png`.
  - Two names for one action: "Resend code" and, after expiry, "Send a new code". Use "Send a new code" for both.
  - The countdown is the label of a disabled ghost button, so it renders at 2.1:1 (light) and 2.7:1 (dark). Disabled
    controls are exempt, but this is information the student needs; render "You can ask for a new code in 0:29" as
    `--ink-2` text, as the expired state already does. `shots/s14-code-expired-phone.png`.

### UX-17 Grouped nits

- **Same action, different words (library review):** reps press "Reject"; the uploader sees "Not published" and "Your
  file wasn't published"; Activity says "turned down"; Your uploads falls back to "decided not to publish". Keep
  "Not published" for the student and "Reject / rejected" for staff, Activity included (`audit.ts`). Owner:
  frontend-accounts, frontend-library.
- **Zero counts in a new Hub:** library link cards say "0 downloads" (a Drive link isn't downloaded; its own page
  says "Opened 0 times"); the empty forum shows "0 replies today" with the green live dot and a 0 next to every
  category. Hide counts at zero. And 16 of the 51 seeded links are titled "Course materials" (plus four "Past
  exams"): add the module to the title in the seed. Owners: frontend-library, frontend-community, content (seed).
  `shots/l02c-library-cards.png`, `shots/h05-forum-empty.png`.
- **Guest reply composer:** it shows a "?" avatar and no hint; "Start a thread" already says "You'll sign in when you
  post. Your draft stays on this device." Use the same line and a neutral avatar. Owner: frontend-community.
  `shots/f02-thread-guest-desk.png`.
- **Moderation on phones:** six count tiles (People, Threads, Replies, Library files included) push the first report
  about 580 px down the screen; the two counts that matter are already on the tabs. Show only the queue counts below 700 px. Owner:
  frontend-accounts. `shots/m05-moderation-phone-light.png`.
- **Reduced motion:** JS smooth scrolls ignore `prefers-reduced-motion` (`UploadDialog.tsx:64`, `ThreadPage.tsx:230`,
  `ThreadPage.tsx:247`); `LessonsTab.tsx:157` shows the right pattern. CSS motion is covered by `base.css`. Owners:
  frontend-library, frontend-community.
- **Mini Noora:** the first-visit bubble covers controls (the phone row's Change and Remove on Your account at 768 px,
  `shots/a13-account-tab-light.png`), and there is no way to put her away (the tester noted the same). Add "Hide Mini
  Noora" to her chat and to the More drawer. Owner: frontend-content.
- **Identifier keyboard:** `inputMode="email"` gives phone users a letters keyboard for a number. Switch to
  `inputMode="tel"` once the field starts with a digit or `+`. Owner: frontend-accounts.
- **Prototype paths in content:** issue JSON shows images under `demo/news/…`, which reads as demo content to a rep.
  Owner: content (seed).

---

## What works well and should stay

- **Sign-in dialog** (`shots/s01`, `s05`, `s06`, `s13`, `s14`, `s16`, `s23`): one field for email or phone with a live
  hint ("We'll text a 6-digit code to +973 3312 3456"), local numbers without +973, a title per channel ("Check your
  messages"), paste and autofill (`one-time-code`, WebOTP on Android), verify on the 6th digit, the wrong code
  selected for retyping with "4 tries left", expiry turning the button into "Send a new code" with a countdown, "We
  sent you a new code.", and plain messages for rate limits ("Try again in 30 minutes") and outages. The profile step
  pre-selects the cohort being browsed and offers "Not a current student".
- **Resuming the action after sign-in**: the star, vote, upload dialog, report dialog, reaction, reply and new thread
  all carry on (verified for star, vote by keyboard, upload; by code for the rest), and the dialog title says why
  ("Sign in to star files").
- **Public content stays public**; pages for some people (`RoleGate`) say who they are for, with a Sign in or Go to
  Home action (`shots/p08`, `p09`).
- **Upload and review loop** (`shots/l08`, `l09`, `l10`, `m20`, `m23`, `m25`, `m26`): every step says a rep checks
  uploads first; "Your uploads" shows "Waiting for review" and later the rep's note; the notification carries the
  reason; reps publish straight away with "Upload and publish".
- **Moderation and People**: counts on tabs, excerpts and the post's current state ("Hidden") on each report, the
  reporter hidden from reps, a note on resolve/dismiss, "Someone got there first", confirmations that explain powers
  and say "They get a notification", no self-demotion (`shots/m02`, `m04`, `p02`, `p03`).
- **Newsletter publishing**: drafts panel for reps, live preview, "Publish and notify everyone" confirmation, a
  generous "first issue is on its way" state for an empty newsletter (`shots/n01`, `n02`, `n07`).
- **Your account**: clear sections, "This device", "To be safe, your other devices were signed out", a delete dialog
  that lists exactly what goes and what stays, export as JSON, the lesson-progress import that asks first
  (`shots/a14`, `a10`, `g13`).
- **States**: skeletons that mirror the final layout on every data page, an error state with Try again everywhere,
  empty states with a next step (`sheet-load-*.png`, `sheet-err-*.png`, `sheet-empty.png`, `shots/h05`).
- **Design system fit and responsiveness**: tokens and components reused, dark mode consistent, tables turn into
  cards, dialogs become bottom sheets, and no page I checked scrolls sideways at 390 px (home, library, forum,
  thread, newsletter, issue, calendar, account, moderation, people, editor, a library item).
- **Accessibility basics**: focus trapped in dialogs with Esc, focus returned to the opener when it still exists,
  visible 2 px focus rings (the cohort cards show theirs on the label), `aria-live` for errors, `aria-pressed` on
  votes, stars and reactions, labelled controls and descriptive names ("Upvote, 2 votes", "Notifications, 2 unread").

## Accessibility measurements

Contrast of the new components, computed from the tokens (WCAG 2.x):

| Pair | Light | Dark | Used for |
|---|---|---|---|
| `--ink-2` on `--surface` | 7.74 | 8.33 | hints, meta, descriptions |
| `--alert-strong` on `--surface` | 5.64 | 6.20 | field errors (12 px) |
| `--alert-strong` on `--alert-soft` | 4.96 | 5.25 | "Not published", suspended banner |
| `--signal-strong` on `--signal-soft` | 4.57 | 6.43 | "This device" (just passes) |
| `--cobalt-ink` on `--cobalt` | 5.70 | 7.33 | primary buttons |
| `--alert-ink` on `--alert-strong` | 5.64 | 6.79 | Delete account, Suspend |
| `--ink` on `--highlight` | 12.47 | 12.47 | "Waiting for review", "Draft" |
| `--ink-3` on `--surface` | **3.64** | 4.76 | "Not added" (UX-14) |
| disabled ghost label (45 % opacity) | 2.13 | 2.74 | resend countdown (UX-16) |
| `--line-strong` on `--surface` | **1.51** | **1.88** | text field and select borders |

The last row is design-system wide and older than this release, but every new form depends on it: a text field on a
white dialog is identified only by a 1.51:1 border, under the 3:1 of WCAG 1.4.11. Owner: frontend-accounts. A
derived `--control-border` of `#7F90AD` light (3.23:1 on surface, 3.01:1 on paper) and `#5670A6` dark (3.45:1), used
in `Field.css` for `.ui-control` and `.ui-search`, would fix it without touching `--line-strong` elsewhere.

The in-page scan of the sign-in steps, Your account, the library, moderation (both queues), the newsletter page and
editor, a thread and People found no other text under AA (its remaining hits were text on highlighter marks and
sliding thumbs, which it can't see, and disabled buttons).

Keyboard walks: sign-in from an Upvote (Tab 20 times to reach it, Enter, type the address, Enter, type the code,
type a name, Tab to the cohort, arrow, Tab, Enter): works end to end and focus returns to the Upvote, now pressed.
Notifications: see UX-2. ⌘K: opens with focus in the field, arrows move, Esc clears then closes. Onboarding: Tab
cycles through the three year cards.

## Coverage

- Guest: first visit (onboarding), Home, library, a Drive link item, forum, thread, new thread, newsletter, issue,
  calendar, account, moderation and people prompts, ⌘K (results, none, slow, error) at all three widths.
- New student: sign-up by email (desktop) and by phone (phone, dark); wrong, expired, stale-after-resend and resent
  codes; network, 429 and 500 on start; profile errors; add an email to a phone account; export; delete dialog;
  lesson progress as a guest and the import prompt.
- Returning student: thread with code, reply, vote, accept, notifications, report, star (resumed after sign-in),
  upload with progress, Your uploads, react to an issue; a suspended student's thread, vote, upload and account.
- Rep: Home, account menu, reports and uploads queues (desktop light, tablet dark, phone), resolve dialog, publish and
  reject with a note, hidden thread view, drafts, editor (desktop and phone), publish confirmation, calendar Add event
  (desktop and phone dark).
- Admin: People (search, role dialog, suspend and lift, activity) at desktop, tablet and phone dark.
- Loading (6 s delay) and error (500) states for Home, library, forum, thread, newsletter, issue, calendar, module,
  account, moderation and notifications; empty states for starred, your uploads, forum search, empty forum and
  notifications.
- Not covered: a real screen reader, iOS Safari and Android Chrome on devices (WebOTP, the on-screen keyboard over
  bottom sheets), and PDF previews (blank in headless Chromium, which has no PDF viewer; phones get "Open the PDF",
  which is right).
