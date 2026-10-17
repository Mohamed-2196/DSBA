# What students see, and where it is edited

Every piece of content a student reads, where an admin or rep changes it, which box that takes, and what it starts
from. "Manage → X" is a tab of `/manage`; a box is a power on the Access screen (`docs/backend/ARCHITECTURE.md`,
D11). Admin holds every box. Last checked 2026-10-17 (round 12).

## Edited in the hub

| Content | Where it's edited | Who | Starts from |
|---|---|---|---|
| Modules: name, short name, unit code, year, description (Markdown), logo or picture, icon, hidden, order | Manage → Modules | `content.edit` | `api/app/seed/data/modules.json`, loaded once into an empty catalogue |
| Chapters and lessons (YouTube videos and playlists, class recordings), their order and hiding | Manage → Modules → a module | `content.edit` | `modules.json` |
| Videos students suggest for a chapter | Manage → Suggested videos (accept or decline) | `content.edit` | students |
| Library files, their details, removing them | the library: uploads wait in Manage → Uploads; a manager edits an item with "Edit details" on its page | `library.manage` (students upload with `library.upload`) | uploads, and the Drive import (`python -m app.cli import-drive`) |
| Past questions tagged by chapter | a paper's viewer; flagged tags wait in Manage → Uploads | signed-in students tag; `library.manage` keeps or removes flagged ones | students |
| The newsletter: issues, sections, cover and pictures with descriptions, polls, publishing, edits after publishing | Manage → Newsletter (every issue, New issue) and each issue's editor, `/newsletter/<slug>/edit` | `newsletter.manage` | `api/app/seed/data/newsletter.json` (two drafts) |
| Programme dates: exams, deadlines, careers dates, term dates, with time, place, rules, source and "not confirmed" | the calendar, "Programme date" and each event's Edit | `calendar.manage` | `api/app/seed/data/calendar.json` |
| Career Navigator: employers and their logos, tracks, roles, skills, electives, certificates, the featured competition, the checklist, further study, the page's labels and year lines | Manage → Career Navigator | `career.edit` | `api/app/seed/data/career.json`, loaded once |
| The guides: Start here (steps, links, when Year 1's card shows, the sites told apart), Results day (steps, links, which calendar dates start the card and for how long), Choosing your electives (title, intro, how many to pick, the note) | Manage → Guides | `guides.edit` (Rep and Content manager hold it from the start) | `api/app/seed/data/guides.json`, until the first save |
| Site settings: the links to MyClass, the UoL portal, the programme regulations and exam entry and results (label, address, a line on what each is for); About's words; contributors; students who shared notes (each module linking to its notes in the library); the footer's lines, copyright holder and launch year; the note under the grades calculator's class | Manage → Site settings | admins | `api/app/seed/data/site.json`, until the first save |
| Mini Noora's daily limit per student and monthly budget | Manage → Numbers | admins | defaults in the code |
| Roles and what each may do; feature switches | Access | admins | the baseline migration |
| Requests' answers | Manage → Requests | `requests.manage` | students |
| Bug reports' status | Manage → Bugs | admins | students |

Every save of the documents edited whole (Career Navigator, the guides, Site settings) and of a module is checked
against the version the editor loaded (a save someone else made first is refused with a "Load it again" banner), and
goes to the activity log with what changed, before and after. Pictures are uploaded (`module_art`,
`newsletter_image`, `career_logo`) and shown only once something students see uses them.

The Daily puzzles' content (themes, quiz questions, groups, word lists) is `api/app/services/daily/data/`; its editor
belongs to the Daily round.

## Still in the code

What an admin or rep might still want to change without code, in the order it would help most. Nothing here is a
student's data; each is copy or a rule that ships with the app.

| Content | Where it is | Why it's still code / what it would take |
|---|---|---|
| The grades calculator's rules: the 13 subjects and their weights, the class bands and the "8 marks with an average" rule | `web/src/features/grades/classify.ts`, `bands.ts`, `GradesPage.tsx` | They are the University's regulations as an algorithm, tested case by case; a change is a code change with tests. The regulations' link and the "isn't official" line are Site settings. |
| Forum categories and tags, and the forum's guidelines and posting tips | `api/app/services/forum/taxonomy.py` (and its copy in `web/src/features/forum/lib/categories.ts`), `ForumSidebar.tsx`, `ComposerAside.tsx` | Threads are filed under the category ids. Editable categories need a table and a migration; the guidelines could join Site settings. |
| The Sunday summary's subject line, headings and send time | `api/app/services/summary.py` | Built from the week's data; only its wording is fixed. |
| Mini Noora's instructions, the programme facts she starts from, her scripted answers and suggestion chips | `api/app/services/noora/prompt.py`, `web/src/features/noora/` | The prompt is tuned with tests; scripted answers hold maths content. |
| Home's default blocks for a new student, the onboarding tour's three steps | `web/src/features/home/blocks.ts`, `web/src/features/onboarding/Tour.tsx` | Each student customises Home themselves; a hub-wide default would be a small Site settings addition. |
| Career Navigator's page intro and the note under the employers | `web/src/features/career/CareerPage.tsx`, `Opportunities.tsx` | Could join the career document's page text. |
| The newsletter's masthead line and the three bundled pictures the editor offers | `web/src/features/newsletter/NewsletterPage.tsx`, `editor/pictures.ts` | Editors upload their own pictures in any issue; the bundled ones are a shortcut. |
| A module's shared Drive folders, which the Drive import copies into the library | `modules.json` → the `drive_folders` table | An admin task (`python -m app.cli import-drive`); students only ever see the library's copies. |
| Section names of a module's files ("Books and study guide", "Past papers", ...) | `web/src/features/modules/resources.ts` | Fixed library kinds. |
| Search's nicknames for modules ("stats", "metrics") and its suggested searches | `api/app/services/search.py`, `web/src/features/search/search.ts` | Small lists; would fit Site settings. |
| Adding a library item that is a link to another site | `POST /library/links` exists; the web app has no form for it | A form in the library for managers. |
| The hub's name, the page title and the installed app's name and description | `web/index.html`, `web/public/manifest.webmanifest` | Read before the app runs; a change needs a build. |
| The logos: DSBA Hub's lockup and tile, MyClass's, the University's and BIBF's, the module pictures that ship with the hub | `web/public/brand/`, `web/public/modules/` | Files of the app. Modules point at their picture by path, so any module can be given an uploaded one instead. |
| Sign-in code and notification emails | `api/app/services/otp.py`, `notify.py` | Transactional copy. |

Google Drive and Docs addresses are refused in library links, Site settings and the guides, and are never rendered as
links anywhere (`web/src/ui/safeHref.ts`): one pasted into a forum post or a newsletter shows as plain text.
