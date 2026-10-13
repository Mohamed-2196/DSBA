# Roadmap

Mohamed's feature requests, kept here so none get lost. Each one is designed with him before it's built: his
answers to its questions, then a short spec in `docs/superpowers/specs/`, then a builder.

The student-user agent's ideas stay in `docs/ideas.md` until Mohamed approves them. Approved ideas move here.

**Status:** to design → designing → approved → building → done.

Round 4 starts once round 3's branches are merged (`docs/STATUS.md`), so the new work doesn't collide with the
router change and the e2e harness.

| # | Feature | Status | Needs first |
| --- | --- | --- | --- |
| R-1 | Roles that each unlock more | done (merged 2026-10-13) | — |
| R-2 | Requests from students | done (merged 2026-10-14) | R-1 |
| R-3 | A better calendar | done (round4/calendar, merged 2026-10-13) | — |
| R-4 | A study board | done (merged 2026-10-14) | R-3, for deadlines |
| R-5 | Notes | done (merged 2026-10-14) | — |
| R-6 | Noora sees what you see | building (round4/noora-ai): Claude via the API, daily cap, budget cap, consent per note | R-5, and the AI decision |
| R-7 | A new Noora | done (merged 2026-10-14) | — (pairs well with R-6) |
| R-8 | Favourite apps | on hold (Mohamed, 2026-10-14: none yet) | R-3, R-4, R-5 |
| R-9 | Edit modules and lessons in the app | building (round4/content): `content.edit` box, seed only fills an empty database | R-1 |
| R-10 | Feature flags, switched in the admin UI | done (merged 2026-10-13) | — |

## R-1. Roles that each unlock more

- **Asked (2026-10-13):** different roles, each with more capability in the UI and elsewhere.
- **Today:** four levels.
  - A guest reads.
  - A student posts, uploads, stars and reacts. Their year is 1–3, or none.
  - A rep (the Rep role) also moderates the forum and the library and edits the calendar and the newsletter.
  - An admin also manages people and roles and reads the audit log.

  The web app gates pages with `RoleGate`. The profile menu adds Moderation for reps and People for admins.
- **Decided (2026-10-13):**
  - Access is by feature. There is a fixed list of boxes, one per thing the app can do: publish the newsletter,
    review uploads, moderate the forum, and so on.
  - A role is a named set of boxes: Student, Newsletter manager, Content manager, Rep, Admin.
  - Admins edit roles on a screen: they tick each role's boxes and create new roles. Admin always has every box.
  - Not contradicted, so assumed:
    - one person can hold several roles, and gets every box any of them ticks;
    - the code checks boxes, never role names;
    - today's reps keep their powers as the Rep role;
    - a suspended account only reads;
    - every change to roles goes to the audit log.
- **First sketch:**
  - A list of what each role may do, decided in one place on the API and sent with `/me`. The UI then shows exactly
    what someone may do, and the API enforces the same list.
  - Each role gets a home of its own:
    - students: their tools (board, notes, requests);
    - reps: a desk (requests, reviews, reports, calendar, newsletter);
    - admins: a console (people, roles, audit, imports).
- **Questions for Mohamed:**
  - Keep the four levels, or add roles, such as a rep for one year only, or a module helper who curates one
    module?
  - Should admins be able to grant single powers to anyone?
  - What should each role see first after signing in?
  - The open call on an "I'm not a student" mode that shows all years belongs here too.
- **Spec:** `docs/superpowers/specs/2026-10-13-access-roles-and-feature-switches-design.md`, written with R-10.

## R-2. Requests from students

- **Asked:** in the student view, a way to request something.
- **Today:** nothing for requests. Reports are the nearest pattern: a student flags a post or a file, and reps work
  through a queue.
- **First sketch:**
  - A student asks for something, and reps see it in a queue.
  - A rep answers, and the student gets a notification.
  - Other students can add "me too", so reps see what matters most.
- **Questions for Mohamed:**
  - What can be requested: a past paper or notes, a fix to wrong content, an event, a feature for the hub, or
    anything?
  - Public with "me too", or private between the student and the reps?
  - Who handles them: any rep, or the rep of the student's year?

## R-3. A better calendar

- **From the UI/UX review (2026-10-13):** see `docs/reviews/ui-ux.md`, "Notes for R-3". On a phone the page runs about
  3,700 px and shows the same events three times. Students need their next exam and this week's deadlines first.

- **Asked:** the calendar's UI isn't good enough.
- **Today:** about 2,000 lines in `features/calendar`:
  - a month grid, an agenda, a day strip and an upcoming board;
  - an event drawer, and the reps' event form;
  - subscribing with an .ics feed, or adding one event to a phone calendar.
- **First sketch:** a redesign that starts from what students check most: what's due this week, and exam dates for
  their year and zone. Agree on mock-ups at phone and laptop sizes before building.
- **Questions for Mohamed:**
  - What bothers you most: the looks, the phone layout, or that it doesn't answer "what's next for me"?
  - Is there a calendar you like that it could learn from, such as Google Calendar, Apple Calendar or Notion?

## R-4. A study board

- **Asked:** a board with to do, in progress and done columns, for students.
- **Today:** nothing like it. Each student's lesson progress (watched lessons, where to resume) is already stored,
  and the calendar knows the deadlines.
- **First sketch:** a private board per student with three columns. Cards can come from the hub: a coursework
  deadline, an exam, or a chapter to watch that moves to done once watched.
- **Questions for Mohamed:**
  - Private only, or shared boards for study groups?
  - Fixed columns, or the student's own?
  - Cards from deadlines added automatically, or only when the student adds them?

## R-5. Notes

- **Asked:** a fast note-taking feature on the web that keeps whatever each student writes.
- **Today:** the library holds notes students share as files. There's nothing for writing your own.
- **First sketch:**
  - Private notes per student, saved to the server as they type, and kept on the device if the connection drops.
  - A note can be attached to a module or a lesson.
  - Markdown with formulas, since much of DSBA is maths.
  - Notes are searchable.
- **Questions for Mohamed:**
  - Plain Markdown, or a rich editor with headings, lists, tables and formulas without symbols?
  - Private only, or shareable by link or into the library?
  - Should it work offline?

## R-6. Noora sees what you see

- **Asked:** connect Noora to the notes, so she can see the screen, or at least a screenshot, and the student does
  little to ask.
- **Today:** Noora is a script, not an AI.
  - She looks the student's words up in the modules, lessons and calendar, and points to where to look.
  - Attachments never leave the browser.
- **First sketch:** this is two different things.
  - **Context.** Noora knows what's open (the lesson, the note, the past paper) and answers about it. No screenshot
    is needed: the app already knows what's on the screen, and that's cheaper and more private than pictures.
  - **Understanding.** Reading a student's note or a photo of their working and explaining it needs an AI model
    behind Noora, for example Claude through the API. That has costs and conditions:
    - a cost per question;
    - a key on the server;
    - a daily limit per student;
    - the student's consent before their note leaves the hub.
- **Questions for Mohamed:**
  - Should Noora become a real AI assistant?
  - If so, what monthly budget?
  - Is it acceptable that a student's note goes to the AI when they ask about it?

## R-7. A new Noora

- **From the UI/UX review (2026-10-13):** see `docs/reviews/ui-ux.md`, "Notes for R-7". She covers content on Home, the
  forum, the editor and Activity. She needs a dock that never covers the page.

- **Asked:** Noora's UI is too basic, and needs more effort.
- **Today:** about 3,300 lines in `features/noora`: a mascot with poses, and a chat panel with a composer, formulas
  and attachments.
- **First sketch:** a proper assistant:
  - docked on laptops and a sheet on phones;
  - suggestions for the page you're on;
  - answers that link into the hub;
  - her character kept.

  Mock-ups come first.
- **Questions for Mohamed:**
  - Keep the mascot and her poses, or a cleaner assistant look?
  - Where should she live: a floating bubble, a side panel, or a page of her own?

## R-8. Favourite apps

- **Asked:** integrations with students' favourite apps.
- **Today:** a calendar feed (.ics) for Google, Apple and Outlook calendars, adding one event to a phone calendar,
  and share links.
- **First sketch:** start with the two or three apps students live in. Likely candidates:
  - Google Calendar, for deadlines and dated board cards;
  - WhatsApp, to share a thread, a paper or a deadline with a group;
  - Notion or Google Docs, to export notes;
  - Google Drive, to save a paper.
- **Questions for Mohamed:** which apps matter most to DSBA students? The student-user agent's research may help.

## R-9. Edit modules and lessons in the app

- **Found (2026-10-13), while designing R-1:** the only content anyone can edit in the app is Career Navigator.
  Modules, chapters and lessons come from `api/app/seed/data/modules.json`, so a content manager has nothing to
  manage there yet.
- **First sketch:** screens for content managers to add and edit modules, chapters, lessons and videos, with the
  seed file kept only as the starting content.
- **Questions for Mohamed:** who keeps lessons up to date today, and how often do they change?

## R-10. Feature flags

- **Asked (2026-10-13):** feature flags, switched in the admin UI, not set in environment variables or code. Is
  PostHog still working, and could flags work with it?
- **Today:** there are no flags.
  - PostHog is wired in: `web/src/main.tsx` loads it when `VITE_POSTHOG_KEY` is set at build time, and its unit
    tests pass.
  - It's off until a key is set, and nothing is deployed yet.
  - Since the security review (SEC-8) it records only page views, anonymously, with PostHog's own feature flags
    turned off.
- **Decided:** flags live in the hub, and admins switch them in the admin UI.
- **First sketch:**
  - Each feature has a switch: off, on for chosen roles (for example a "Testers" role), or on for everyone.
    - Existing features: forum, library uploads, newsletter, calendar, Career Navigator, Noora.
    - New ones too: board, notes, requests.
  - New features arrive switched off.
  - The API enforces the switch as well as the UI.
  - PostHog keeps doing analytics. It can be told which features were on during a visit, still anonymously, to show
    what gets used.
- **Designed with R-1,** since they share the admin screen and `/me`.
- **Spec:** `docs/superpowers/specs/2026-10-13-access-roles-and-feature-switches-design.md`.
