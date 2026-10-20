# What students see, and where it is edited

Every piece of content a student reads, where an admin or rep changes it, which box that takes, and what it starts
from. "Manage → X" is a tab of `/manage`; a box is a power on the Access screen (`docs/backend/ARCHITECTURE.md`,
D11). Admin holds every box. Last checked 2026-10-18 (round 12).

## Edited in the hub

| Content | Where it's edited | Who | Starts from |
|---|---|---|---|
| Modules: name, short name, unit code, year, description (Markdown), logo or picture, icon, hidden, order | Manage → Modules | `content.edit` | `api/app/seed/data/modules.json`, loaded once into an empty catalogue |
| Chapters and lessons (YouTube videos and playlists, class recordings), their order and hiding; each chapter's words for search ("mle", "cramer rao") | Manage → Modules → a module | `content.edit` | `modules.json` |
| Videos students suggest for a chapter | Manage → Suggested videos (accept or decline) | `content.edit` | students |
| Library files, their details, removing them; links to resources kept on other sites (with a past paper's sitting) | the library: uploads wait in Manage → Uploads; a manager edits an item with "Edit details" on its page, and adds a link with "Add a link" (never Google Drive or Docs) | `library.manage` (students upload with `library.upload`) | uploads, and the Drive import (`python -m app.cli import-drive`) |
| Past questions tagged by chapter | a paper's viewer; flagged tags wait in Manage → Uploads | signed-in students tag; `library.manage` keeps or removes flagged ones | students, and Claude's tags in `api/app/seed/data/paper_questions.json` (below) |
| The newsletter: issues, sections, cover and pictures with descriptions, polls, publishing, edits after publishing | Manage → Newsletter (every issue, New issue) and each issue's editor, `/newsletter/<slug>/edit` | `newsletter.manage` | `api/app/seed/data/newsletter.json` (two drafts) |
| Programme dates: exams, deadlines, careers dates, term dates, with time, place, rules, source and "not confirmed" | the calendar, "Programme date" and each event's Edit | `calendar.manage` | `api/app/seed/data/calendar.json` |
| The forum's categories (name, short name, its year or every year, the line under it, its picture, retired) and tags (name, retired), in order; where a thread goes when no year fits it; the guidelines (with their pictures) and the posting tips | Manage → Forum | `forum.moderate` | categories and tags: the `forum_categories` and `forum_tags` tables, filled by migration 0033 with the forum's first ones; the rest: `api/app/seed/data/forum.json`, until the first save |
| Career Navigator: employers and their logos, tracks, roles, skills, electives, certificates, the featured competition, the checklist, further study, the page's intro, the note under the employers, its labels and year lines | Manage → Career Navigator (Page text for the intro and the note) | `career.edit` | `api/app/seed/data/career.json`, loaded once |
| The Sunday summary's words: its subject line (`{year}`, `{week}`), the headings of its parts, the line before its closing link, and the time it goes out on Sunday (Bahrain) | Manage → Sunday summary, under the week's text (with a preview of this week in the draft words) | `summary.share` | `api/app/seed/data/summary.json`, until the first save |
| The newsletter's line under its name, and the pictures its editor offers for covers and beside sections (uploaded once, offered to every issue; an uploaded one is kept while it's offered) | Manage → Newsletter, Settings under the issues | `newsletter.manage` | `api/app/seed/data/newsletter_settings.json`, until the first save |
| The guides: Start here (steps, links, when Year 1's card shows, the sites told apart), Results day (steps, links, which calendar dates start the card and for how long), Choosing your electives (title, intro, how many to pick, the note) | Manage → Guides | `guides.edit` (Rep and Content manager hold it from the start) | `api/app/seed/data/guides.json`, until the first save |
| Site settings: the links to MyClass, the UoL portal, the programme regulations and exam entry and results (label, address, a line on what each is for); About's words; contributors; students who shared notes (each module linking to its notes in the library); the footer's lines, copyright holder and launch year; the note under the grades calculator's class; Home's blocks for a student who hasn't arranged their own (a guest's leave out what needs an account); exam week on phones (on or off, days before an exam, which parts lead); the tour's steps (title, words with keys in backticks and `{mod}`, illustration); search's other words for modules ("stats" finds modules named "statistic…") and its suggested searches | Manage → Site settings | admins | `api/app/seed/data/site.json`, until the first save |
| Mini Noora's instructions and the programme facts her AI reads first (with a preview of the whole prompt); her script: what she says without her AI (greeting, who she is, thanks, refusal, "nothing found", photos and files), the questions she offers after hello and when nothing matches, the questions on each page (with `{module}` and `{module2}`, and whether each needs the calendar or the library), the line on her full page and its starter cards (four or eight, so they fill whole rows) | Manage → Mini Noora | admins | `api/app/seed/data/noora.json`, until the first save |
| The grades calculator's rules: its subjects in order (a module, or a choice the student makes), what each counts (1, 2 or 3 classification marks, or the average of those averaged) and what that average counts; where each band starts and its US GPA; what each class needs (the marks in its band or better, the smaller number with an average, and each class's average); Third Class Honours in the regulations' words; which regulations hold the rules; the modules a student picks for the Year 2 option and the electives | Manage → Grades calculator (a worked example recalculates as the draft changes, beside what the saved rules give) | admins | `api/app/seed/data/grades.json`, until the first save |
| Daily puzzles: today's puzzles and a fix to a mistake in them (below); themes, their order in the rotation and the theme of any week to come; each game's items, named as the hub names the games (The Word's answer words, Correlations' groups of four to eight words, Data Mine's words, The Daily Query's questions with their module, Nearest Neighbour's secret words), retired or brought back; The Word's guess list; Nearest Neighbour's vocabulary (tags, close words); bulk imports of word lists and spreadsheet rows; a preview of any day | Manage → Daily puzzles | `content.edit` | the themes and the public guess list in `api/app/seed/data/daily`; the puzzles from the private content file (below) |
| Daily puzzles' content file, loaded on a new install | Manage → Daily puzzles → Load a content file, or `python -m app.cli daily-content import FILE` | admins | the file kept out of the repository |
| Mini Noora's daily limit per student and monthly budget | Manage → Numbers | admins | defaults in the code |
| Roles and what each may do; feature switches | Access | admins | the baseline migration |
| Requests' answers | Manage → Requests | `requests.manage` | students |
| Bug reports' status | Manage → Bugs | admins | students |

Every save of the documents edited whole (Career Navigator, the guides, Site settings, the forum's settings, Mini
Noora, the Sunday summary's words, the newsletter's settings, the grades calculator's rules) and of a module is checked
against the version the editor loaded (a save someone else made first is refused with a "Load it again" banner), and
goes to the activity log with what changed, before and after. Each shows what a change does before it's saved (a
preview, or the grades calculator's worked example), and none links to Google Drive or Docs. Pictures are uploaded
(`module_art`, `newsletter_image`, `career_logo`) and shown only once something students see uses them.

A field added to one of these documents gets a default in its schema (`api/app/schemas`): a saved document without
the field reads with the default, so no migration copies new parts into saved documents and reading one never fails.

The grades calculator keeps a student's marks in their browser by subject id, so a change to the subjects never moves
anyone's marks; the marks never reach the server.

Mini Noora's prompt is never shown to students (GET /mini-noora/settings is for admins); her script is public (GET
/mini-noora/script). Her instructions and facts can't hold `<hub_data>` or `<student_note>`, which mark what she reads
as data. Saving her words asks an admin for a code when they signed in more than ten minutes ago, like the other
admin powers, and the activity log shows the prompt's words to admins only.

The newsletter's masthead line is public; the pictures its editor offers are listed only to the people who manage the
newsletter (GET /newsletter/pictures), since one may be for an issue nobody has read yet.

A forum category or tag keeps its id for good (threads are filed under it; a new one gets an id from its name when it
is first saved). One that threads use can't be removed, only retired: it stops being offered, and its threads keep it
and still show its name. The default category ("threads that fit no year go to") must be a category for every year.

### Daily puzzles: loading the content on a new environment

The answers never go in the public repository, so a new environment (a fresh database, the Railway dev site) starts
with the themes and the guess list only, and Daily shows no puzzles. Load the content file:

- **Where it is.** `/Users/mohamed/dsba-hub/private/daily-content.json` on Mohamed's Mac; `private/` is git-ignored.
  Keep it out of the repository and out of chats: it holds every answer. `python -m app.cli daily-content export
  FILE` writes a fresh one from any environment whose content has been edited in Manage.
- **With no shell (the Railway dev site):** sign in as an admin, open Manage → Daily puzzles → Load a content file,
  pick the file, press Check to see what it would add and leave, then Load. Only admins see the action, and the API
  refuses anyone else (`POST /api/v1/content/daily/bundle`, 1 MB at most).
- **With a shell:** `python -m app.cli daily-content import private/daily-content.json` (in Docker: mount the file and
  run it in the `api` container; `docs/backend/DEPLOYMENT.md`, section 4).

Both take the same path: the file is checked with the editor's rules, what the database lacks is added, and what is
there stays as it is, so loading the same file again changes nothing. Themes join the rotation (on an environment
with none yet) once every game has what it needs. A guess list under 5,000 words lacks the shipped one (the file came
before the seed, and brought its answers only): a load, like the seed, adds the shipped list to it, and Manage warns
until it has it. A full list keeps the words editors took off. The activity log keeps one entry per load that changed something,
with counts only. After that, everything is edited in Manage → Daily puzzles: changes reach the days to come, and a
day that is out keeps its puzzles.

### Daily puzzles: fixing a mistake in today's

A day's puzzles are stored the first time anyone opens them, and edits reach the days to come. A mistake in today's
puzzle (a typo in a question, a wrong word in a group, a wrong answer) is fixed in Manage → Daily puzzles → Today:

- **Today** lists each game's puzzle as students have it, with the items it uses (a group's four words on today's
  board and the rest of its list) and how many signed-in students finished it or are partway through. A puzzle
  nobody has opened yet is made from the items as they are when someone does, so an edit reaches it.
- **Fix** opens the item with "Fix today's puzzle too" on (an item in today's puzzle shows "In today's puzzle" in its
  game's list too). Preview today shows what changes in plain words, who it reaches and today's puzzle with the
  change highlighted; nothing changes until Apply to today. A fix keeps the item's theme and a group's level, and
  changes only what it needs: a word fixed in a group changes that word on the board.
- **What players see.** Finished games keep their results and points, on the puzzle they finished. Games not
  finished start again on the fixed puzzle, and a player who had made moves sees "We fixed a mistake in today's
  puzzle, so your game started again." until their next move. Guests' games follow the same rule.
- The fix goes to the activity log with the item before and after and what changed today. A game takes five fixes a
  day; after that, edits reach the days to come only.

Correlations groups hold four to eight words. Each day shows four words of each of its four groups, picked from the
day's seed, so a group's words change from day to day; a word may be in two groups of a theme, and a day with both
groups shows neither of them that word.

### Past questions: Claude's tags

Claude's tags name the model instead of a tagger (`paper_questions.tagged_by_model`): students flag them, and
`library.manage` keeps or removes them like a student's. Each tag gives a question one or two chapters and up to
three study-guide topics of those chapters, and the question's opening words (`anchor`), which the paper viewer
highlights.

- **Chapter outlines:** `api/app/seed/data/chapter_outlines.json` holds each chapter's study-guide outline (the
  guide it comes from, outcomes, topics with ids, key terms). The seed writes them to `chapters.outline` and
  `chapter_topics`; a topic id is the title in lowercase with every other run of characters a hyphen, cut to 48.
  Tagging judges questions against these outlines, so a chapter the outline lacks gets no questions of its own.
- **Shipped tags:** `api/app/seed/data/paper_questions.json`, one entry per paper, named by its Drive import key and
  the SHA-256 of its file (the same on every install). Each question has `question`, `page`, `chapters`, and may
  have `section`, `anchor` (at most 160 characters, on that page) and `topics` (`"<chapter id>:<topic id>"`).
  `python -m app.cli seed` loads them onto the papers the install has, replacing Claude's older tags of a listed
  paper; it never touches a student's tag or brings back one a moderator removed. Run it again after the Drive
  import (`scripts/seed-real.sh` does).
- **Bulk retagging:** done with Claude Code Haiku subagents, not the API (2026-10-21): each reads a paper's text and
  the module's outline and writes the entry above; a script checks chapter and topic ids and that each anchor is on
  its page before the file is committed.
- **New papers:** with `library.autotag` on and `DSBA_ANTHROPIC_API_KEY` set, publishing a past paper queues a job
  that the mail worker runs: Claude (`claude-haiku-5-5`) tags it from the outlines, within Noora's monthly budget.
  Admins see each paper's status and run it again in Manage → Uploads → Tagging new past papers (audited). Without
  the key or the switch the job is skipped and the paper is published as usual.
- **CLI:** `tag-questions` (`--dry-run`, `--sample N`, `--module`, `--redo`, `--batch <id>`) tags through the API as
  a Message Batch, and `export-question-tags` writes Claude's tags back to the seed file.

## Still in the code

What an admin or rep might still want to change without code, in the order it would help most. Nothing here is a
student's data; each is copy or a rule that ships with the app.

| Content | Where it is | Why it's still code / what it would take |
|---|---|---|
| How the grades calculator classifies (counting marks into bands, then the class rules in order) | `web/src/features/grades/classify.ts`, `whatif.ts` | The algorithm stays in code with its tests; every number and subject it uses is the rules above. The calculator's example records (marks by subject id) are `examples.ts`. |
| What Home's blocks are, and the tour's three illustrations | `web/src/features/home/blocks.ts`, `web/src/features/onboarding/TourArt.tsx` | Each block is a part of the app; Site settings choose which a new student sees and in what order, and which illustration each step shows. |
| Mini Noora's own words for modules in her script ("maths", "stats", "metrics") | `web/src/features/noora/brain.ts` | Search's other words are in Site settings; her script's three are tuned with its tests. |
| Mini Noora's rules that always follow her instructions, and the maths her script shows (the MGFs, integration by parts, the reduction formula) | `FIXED_RULES` in `api/app/services/noora/prompt.py`, `web/src/features/noora/brain.ts` and `formulas.ts` | The fixed rules keep her honest, her links inside the hub and the hub's data from being read as orders: no edit may remove them, and Manage shows them read-only. The maths is worked content, tested case by case. |
| A module's shared Drive folders, which the Drive import copies into the library | `modules.json` → the `drive_folders` table | An admin task (`python -m app.cli import-drive`); students only ever see the library's copies. |
| Section names of a module's files ("Books and study guide", "Past papers", ...) | `web/src/features/modules/resources.ts` | Fixed library kinds. |
| The hub's name, the page title and the installed app's name and description | `web/index.html`, `web/public/manifest.webmanifest` | Read before the app runs; a change needs a build. |
| The logos: DSBA Hub's lockup and tile, MyClass's, the University's and BIBF's, the module pictures that ship with the hub | `web/public/brand/`, `web/public/modules/` | Files of the app. Modules point at their picture by path, so any module can be given an uploaded one instead. |
| Notification emails and account notices | `api/app/services/notify.py`, `signin.py` | Transactional copy. |

Google Drive and Docs addresses are refused in library links, Site settings and the guides, and are never rendered as
links anywhere (`web/src/ui/safeHref.ts`): one pasted into a forum post or a newsletter shows as plain text.
