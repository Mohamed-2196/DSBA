# Ideas

Feature ideas from the student-user agent, for Mohamed to approve.

**How approval works.** Mohamed changes an idea's status from proposed to approved or declined, with a word on why.
Approved ideas move to `docs/ROADMAP.md` and a builder picks them up; builders mark them built here. A declined idea
comes back only if something changes, and it then says what.

Mohamed's own requests, R-1 to R-10, are in `docs/ROADMAP.md`. Ideas here don't repeat them. An idea that sharpens
one carries its number, like "R-3".

## Round 1: 13 October 2026

**How I used the hub.** As a guest and as three made-up students (Layla in Year 1, Hamad in Year 2, Reem in Year 3),
on a 390×844 phone and a 1366×768 laptop. I went through the first week of term, a normal week with a forum question
(posted, then deleted), the night before an exam, and results day with the grades calculator and Career Navigator.
It was six days before the October session's first paper. The Drive import hadn't landed, so every library item was
still a link to a Drive folder. I also read the v1 site on `gh-pages` and what round 3 is building.

**What stood out.**
- The exam countdown is the best thing on Home, but it counts papers you don't sit. Hamad's says "then five more
  exams" because it counts both Year 2 options. Reem's Home lists all six Year 3 modules, though she takes four.
- The night before EC1002, "Past papers" opens a Drive folder, and nothing pairs a paper with its examiners' report.
  Search finds nothing for "supply and demand", though EC1002's second chapter has that name.
- A question with a formula shows raw `$\hat{\theta}$`, and "2023 Zone A Q2(b)" can't point at the paper.
- Year 3 gets least: no lessons, no unit codes, no exams on the calendar and a near-empty Home.
- Career Navigator is rich, but it doesn't know your electives and has no application dates. Its "Ask a senior"
  panel is built but hidden, because nobody is listed.
- The dates are thin. 18 of the 30 dates from October to February say "Not confirmed", and none of the ten October
  exams has a time or a place.

## Research for the roadmap

### R-8: the apps DSBA students live in

**WhatsApp first, the phone's calendar second, Google Drive third.** Build R-8 around sharing into WhatsApp well,
not around an API.

1. **WhatsApp.** Each year's group and the module groups are where dates, questions, files and "does anyone have the
   2019 paper?" go. The hub says so itself on About: it "does not replace your email, the VLE, BIBF MyClass, the UoL
   student portal or your WhatsApp groups". Outside evidence:
   - in a study of 175 mass communication students at Saudi and Bahraini universities, students used WhatsApp to
     discuss assignments, pass on course announcements and swap previous and expected exam questions
     ([EJEDP 8(3), 2020][ejedp]);
   - WhatsApp "is the most used platform" in Qatar, "which aligns with what most nationals in the region use"
     ([NU-Q, Media Use in the Middle East 2022][nuq]). DataReportal has no WhatsApp figure for Bahrain, because Meta
     doesn't publish one ([Digital 2026: Bahrain][dr]).

   For R-8 this means the hub shouldn't try to post into groups: WhatsApp's business platform charges per message
   and is built for a business writing to its customers, not for a class group. The integration is making hub links
   worth pasting: link previews (IDEA-22), a "Share to WhatsApp" button (`wa.me/?text=`), and a weekly summary reps
   can paste (IDEA-21).
2. **The phone's calendar:** Google Calendar, Apple Calendar or Outlook. The `.ics` feed already reaches all three.
   Make the feed follow your own papers without an account (IDEA-10), and add application dates (IDEA-18).
3. **Google Drive** (and YouTube). The cohort's material was shared as 49 Drive folders, students' own notes
   included, and every lesson is a YouTube video. Round 3's import brings the files in. After that, Drive matters
   as where students keep their own notes, so R-5 should import from and export to Drive before Notion.

Less likely to matter for study: TikTok, YouTube, Instagram and Snapchat reach most people in Bahrain, but for social
life. In October 2025 TikTok had 1.31 million adult users there, YouTube 1.23 million, and Instagram and Snapchat
1.10 million each ([DataReportal][dr]). Notion and Anki are personal tools that a few students use; R-5's Markdown
export covers Notion.

Before building more, ask the cohort: one poll in the next newsletter issue (IDEA-20) would settle it.

### R-2: what students would ask reps for

From the hub's own data and the usual work of course reps, in the order I'd expect them:

1. **A file that isn't there:** a past paper for a year and zone, its examiners' report, worked answers, notes or a
   cheat sheet. Today 13 of 16 modules have no exercises folder and 15 have no cheat sheet, and Year 3 has only the
   VLE's papers. In the study above, students used WhatsApp to swap old exam questions.
2. **Is this date right?** 18 of the 30 dates from October to February are "Not confirmed", and the October exams
   have no time or room.
3. **A session:** a revision class, a past-paper walkthrough or a mock before May.
4. **Feedback for BIBF:** a timetable clash, a missing recording, a room, the pace of a module. This is the core of a
   course rep's job: consulting "fellow students about academic issues of concern to them" and raising "issues
   relating to learning and teaching" ([Westminster's course rep role][wmin]). These need privacy and a reply.
5. **The hub itself:** a broken link, wrong module details (Year 3's missing unit codes), a feature. Today the only
   route is "Report a problem" on GitHub (D6).

For R-2's open questions this suggests two kinds of request:
- public requests with "me too" for files and dates, which can close themselves when the file or the confirmation
  arrives (IDEA-19);
- private requests to your year's reps, for feedback on teaching and anything personal.

UK universities give reps tools such as Unitu for the same job: students post and upvote, and reps and staff reply.
A "You asked, we did" list would show students that asking works.

[ejedp]: https://eajournals.org/ejedp/vol-8-issue-3-september-2020/the-impact-of-whatsapp-utilization-patterns-among-mass-communication-students-of-saudi-and-bahraini-universities-for-academic-purposes/
[nuq]: https://www.mideastmedia.org/survey/2022/chapter/focus-on-qatar/
[dr]: https://datareportal.com/reports/digital-2026-bahrain
[wmin]: https://www.westminster.ac.uk/sites/default/public-files/general-documents/course-rep-role-description-25-26.pdf
[uol]: https://london.ac.uk/sites/default/files/examiners/duties-chief-examiner-2018-2019.pdf

## The night before an exam

Each year the University of London sets two papers per course, zone A and zone B, "at least 50% different" from
each other and from the year before ([examiners' duties, 2018/19][uol]). A module soon has dozens of papers, and the
examiners' commentaries explain what was marked down. Finding the right one fast is the job.

### IDEA-1. Each past paper with its examiners' report · quick win

- **The moment:** Layla (Year 1), the night before EC1002: "I want the 2023 Zone A paper and what the examiners said
  about it, without opening five Drive folders."
- **The idea:** A module's past papers grouped by sitting, newest first: each year and zone with its paper and its
  examiners' report side by side. A paper's page links to its report and to the other zone's paper from that year.
  A "Time me" button can run a 1, 2 or 3 hour countdown, then offer the report.
- **Builds on:** the library kinds `past-paper` and `examiners-report`, with `examYear` and `zone` from
  `import-drive` and `exam_meta_from_name`; `GET /library/items`; the module's Files tab and the file viewer.
- **Size:** S, mostly web. The API may add `exam_year` and `zone` filters. After round 3's Drive import.
- **Costs and risks:** only as good as the file names that `exam_meta_from_name` can read. Anything without a year
  goes under "Other papers". No moderation and no personal data.
- **How we'd know it worked:** examiners' reports downloaded nearly as often as papers before May (`downloadCount`
  by kind).
- **Status:** proposed.

### IDEA-2. Search inside papers

- **The moment:** Hamad (Year 2): "Which ST2134 papers had a Cramér–Rao question? I'd do all of them tonight."
- **The idea:** When a PDF is published, by upload or by the Drive import, keep its text for search. A result shows
  the paper, the page and the words that matched, and opens the viewer at that page.
- **Builds on:** the library's `search_vector` (GIN, `websearch_to_tsquery`), `GET /search` and `q` on
  `/library/items`, the checks that `complete` and `import-drive` already run on each file, the inline PDF viewer.
- **Size:** M, mostly API (a text column and a migration, extraction, snippets), with small web changes. It needs a
  PDF text library such as `pypdf`: a dependency for the lead.
- **Costs and risks:** one pass per file when it's published. Scanned papers have no text and stay title-only; OCR
  would cost more, so leave it out. Formulas extract badly; words like "likelihood" extract fine.
- **How we'd know it worked:** fewer library searches ending in "No files match"; more papers opened from search.
- **Status:** proposed.

### IDEA-3. Past questions by topic

- **The moment:** Layla, after the Elasticity chapter: "Which exam questions were on elasticity?"
- **The idea:** On a past paper's page, signed-in students tag a question with one of the module's chapters ("Q3:
  Elasticity"), picked from a list, never typed. Each chapter on the Lessons tab then lists its past questions
  ("2023 A Q3, 2021 B Q5") and opens the paper at the right page. Reps remove wrong tags.
- **Builds on:** the modules' chapters, IDEA-1's sittings, IDEA-2's page numbers if built, the reporting and
  moderation pattern.
- **Size:** L, both: a table and a migration, endpoints, tagging on the viewer, the list on Lessons.
- **Costs and risks:** useless until enough is tagged, so start with reps tagging one Year 1 module before May. Wrong
  tags mislead, so any student can flag one. It stores who tagged what, for moderation only.
- **How we'd know it worked:** share of each module's papers tagged by April; clicks from chapters to questions in
  May.
- **Status:** proposed.

### IDEA-4. Ask about a paper's question

- **The moment:** Hamad: "I'm stuck on 2023 Zone A Q2(b). Has anyone asked about it?" Today that's plain text in a
  post.
- **The idea:** The new-thread form takes an optional past paper and question number. The thread links to the
  paper. The paper's page lists "Questions about this paper", with their numbers and whether they're answered, and
  "Ask about a question" opens the composer filled in.
- **Builds on:** forum threads (`module_id`, the Past papers tag), composer presets (`/forum/new?module=…`), the
  file viewer, IDEA-1.
- **Size:** M, both: two optional thread fields and a migration, a `paper` filter, composer and viewer changes.
- **Costs and risks:** the forum's rule against sharing exam questions while an exam window is open, so papers from
  a session still running can't be picked. Moderation as usual.
- **How we'd know it worked:** threads that name a paper, and how often they get an answer compared with others.
- **Status:** proposed.

### IDEA-5. Search finds lessons · quick win

- **The moment:** Layla types "supply and demand" and gets no results, though EC1002's second chapter is Supply and
  Demand.
- **The idea:** Search (⌘K and the search page) also matches chapter and video titles, and opens the lesson.
- **Builds on:** `GET /search` (a `lesson` type from the modules' chapters) or the palette's own matching. Noora
  already looks lessons up (`noora/knowledge.ts`).
- **Size:** S, API or web.
- **Costs and risks:** none worth noting; 384 video titles is small. YouTube titles are noisy, so chapter titles rank
  first.
- **How we'd know it worked:** fewer searches with no results; lessons opened from search.
- **Status:** proposed.

## Asking and answering

### IDEA-6. Formulas in forum posts

- **The moment:** Hamad's ST2134 question showed `$\hat{\theta} = \max_i X_i$` as dollar signs and backslashes.
- **The idea:** `$…$` and `$$…$$` render as maths in threads, replies and the composer's Preview. KaTeX is bundled
  with the app, not from a CDN, and loads only when a post has maths. A Σ button on the toolbar inserts an example.
- **Builds on:** the forum's markdown (`forum/lib/markdown.ts` gets a maths token), `Prose`, the editor's Preview.
  R-5 wants "Markdown with formulas" for notes, so build the renderer once for both.
- **Size:** S to M, web only.
- **Costs and risks:** about 300 KB with fonts, loaded only when needed. Render with `trust` off and size limits, so
  a post can't freeze a page. Draw with `katex.render` into an element, never `dangerouslySetInnerHTML`. The
  production CSP already allows the app's own fonts and inline styles.
- **How we'd know it worked:** posts with maths in the statistics and maths modules; fewer questions that are only
  a photo.
- **Status:** proposed.

### IDEA-7. Follow a question

- **The moment:** Layla: "Someone already asked my exact question. I voted, but I won't know when it's answered."
- **The idea:** A Follow button on threads, switched on when you vote or reply and easy to switch off. Followers hear
  when an answer is accepted, and about new replies if they choose.
- **Builds on:** thread votes, notifications (a new kind, so a migration), the Replies email switch, Your account.
- **Size:** S to M, both.
- **Costs and risks:** noise, so by default only accepted answers. One row per person and thread, in the export and
  deleted with the account.
- **How we'd know it worked:** follows per thread; fewer duplicate threads.
- **Status:** proposed.

### IDEA-8. Ask without your name

- **The moment:** Layla: "I don't want 160 people to see my name on a question this basic."
- **The idea:** "Post without my name" on a new thread. Classmates see "A Year 1 student". Whoever can moderate the
  forum still sees who it is, and the author edits and deletes as usual.
- **Builds on:** forum threads, `accounts.public_user()` (mask the author in one place), moderation and the audit
  log, R-1's "moderate the forum" box.
- **Size:** S to M, both: a flag and a migration, the masking, a checkbox.
- **Costs and risks:** a product call. Anonymous posts can be ruder, so reps see the author, reports and rate limits
  apply, and it could be for questions only, not replies. The masking must cover lists, search, notifications and
  other people's exports.
- **How we'd know it worked:** more Year 1 questions; how many first posts use it.
- **Status:** proposed.

### IDEA-9. Help the year below · quick win

- **The moment:** Hamad (Year 2): "I did well in ST1215. I'd answer a Year 1's question, but I never open the Year 1
  forum."
- **The idea:** For Years 2 and 3, a small Home panel with up to three unanswered questions from the years below,
  newest first. Hidden when there are none.
- **Builds on:** `GET /forum/threads?unanswered=true&year=…`, Home's panels.
- **Size:** S, web only.
- **Costs and risks:** none.
- **How we'd know it worked:** replies from Years 2 and 3 on Year 1 threads; time to a first reply.
- **Status:** proposed.

## Your papers and your dates

### IDEA-10. R-3: your papers, not just your year

- **The moment:** Hamad's Home says "then five more exams", counting both Year 2 options, though he takes
  Econometrics. Reem's lists six Year 3 modules; she takes four. Someone sitting a paper from another year doesn't
  see it at all.
- **The idea:** Pick your papers once: your Year 2 option, your Year 3 electives, and any paper you're sitting from
  another year. The countdown, Your modules, the calendar's own-year view and its feed, Career Navigator's role fit
  and the grades calculator's choices all follow. Saved privately on the account, and in the browser for guests.
- **Builds on:** `Me` and its preferences, the calculator's choice slots, Career Navigator's `chosen` map, calendar
  events' `module_id`, `feed.ics` (a `modules` parameter keeps the feed anonymous), `home/session.ts`.
- **Size:** M, both.
- **Costs and risks:** which papers someone sits, a resit included, is personal: never in public responses, in the
  export, gone on deletion. Without picks, everything works as it does today.
- **How we'd know it worked:** share of Year 2 and 3 accounts with picks; feeds that use `modules`.
- **Status:** proposed.

### IDEA-11. R-3: dates that tell you enough

- **The moment:** Layla, the day before EC1002: "What time? Which hall? Can I take my calculator?"
- **The idea:** Exam entries carry the start time, the place, the length and a line on the rules (calculator, what
  to bring), from the official timetable. A VLE MCQ or coursework window shows as one entry with "4 days left". A
  "Not confirmed" date says who to ask.
- **Builds on:** events' `time`, `place` and `end_date`, already in the model and the reps' form (the seed splits
  each MCQ window into two one-day events); the forum's Exam rules and Calculators tags; R-3's redesign.
- **Size:** S to M, mostly data and web. A length or rules field needs a migration.
- **Costs and risks:** reps' upkeep every session, and a wrong time does harm, so show where it came from and when
  it was checked.
- **How we'd know it worked:** fewer "what time is it?" threads in exam weeks.
- **Status:** proposed.

### IDEA-12. R-3: tell people when a date changes

- **The moment:** "The ST2134 mock moved to Thursday. It was in the group at 11 pm, between 200 other messages."
- **The idea:** When a rep changes the date, time or place of an exam, mock or deadline, or confirms a date, that
  year gets a notification saying what changed, and an email if they keep it on. The rep's form has "Tell Year 2"
  ticked.
- **Builds on:** `PATCH /calendar/events`, `notify()` for each student in that year, the outbox and email switches
  (a new kind and switch, so a migration), the audit log.
- **Size:** S to M, both.
- **Costs and risks:** notification fatigue, so only exams, mocks and deadlines, and at most one notice per event a
  day.
- **How we'd know it worked:** these notifications get opened; fewer "is it still on?" questions.
- **Status:** proposed.

## Revising

### IDEA-13. R-4: a revision plan to the exam date

- **The moment:** Layla, six days before EC1002 with 72 videos unwatched: "How much do I need to do a day?"
- **The idea:** "Plan my revision" on a module spreads the unwatched chapters, and a past paper every few days, over
  the days left, as cards on the board. Watching a lesson ticks it off; falling behind spreads the rest again.
- **Builds on:** lesson progress (`lesson_views`, resume), the exam date, R-4's board, IDEA-1.
- **Size:** M, mostly web, after R-4.
- **Costs and risks:** a plan can nag, so no notifications, only the board.
- **How we'd know it worked:** plans made in the month before a session; lessons watched in the last two weeks.
- **Status:** approved; built in round 5 (`round5/board2`).

### IDEA-14. R-4: past papers as cards, scores kept private

- **The moment:** Hamad keeps a list in his phone of the papers he's done and his marks.
- **The idea:** "Add to my board" on a paper. Marking it done asks for an optional score, which stays in the browser
  like the grades calculator's marks. The module shows "4 of 12 sittings done".
- **Builds on:** R-4's board, IDEA-1's sittings, the rule that marks stay in the browser.
- **Size:** S to M, web, after R-4.
- **Costs and risks:** whether practice scores are cleared on sign-out, as grades are (D10), is Mohamed's call.
- **How we'd know it worked:** papers marked done per student before May.
- **Status:** approved; built in round 5 (`round5/board2`).

## Year 3, electives and careers

### IDEA-15. R-9: Year 3 first, with videos students suggest

- **The moment:** Reem: "Machine Learning has no lessons, not even chapters. Year 1 has 222 videos."
- **The idea:** When R-9's editor lands, start with the seven modules that have no lessons: IS2184 and all of Year 3.
  Let any student suggest a video for a chapter, with a YouTube link and a line on why. Suggestions wait in the
  content manager's queue, like uploads.
- **Builds on:** R-9, the library's review queue, the link rules in `core.links`, YouTube embeds that the CSP
  already allows, R-1's Content manager role.
- **Size:** M on top of R-9, both.
- **Costs and risks:** curating takes a content manager's time. Links rot, so the daily sweep could check them later.
- **How we'd know it worked:** Year 3 modules with lessons by January; Year 3 lesson views.
- **Status:** proposed.

### IDEA-16. Choosing your Year 3 electives

- **The moment:** Hamad on results day: "Asset Pricing or Marketing Management? What does each lead to, and what did
  last year's students think?"
- **The idea:** "Choose your electives" in Career Navigator, also linked from Modules for Year 2: the four electives
  side by side, with what each covers, the skills and roles it adds, its Module choice threads and seniors' notes.
  Picking two sets your papers (IDEA-10).
- **Builds on:** Career Navigator's skills by module, roles and `chosen` map; the modules; the forum's Module choice
  tag; IDEA-10.
- **Size:** M, mostly web, with a few fields per elective in the career data.
- **Costs and risks:** content upkeep. It must say it's a guide, not advice from BIBF.
- **How we'd know it worked:** views from July to September; Module choice threads.
- **Status:** proposed.

### IDEA-17. Seniors who answer

- **The moment:** Reem: "I did NBB's internship. I'd tell Year 2s how to apply." Hamad: "I want to ask someone
  who's done it."
- **The idea:** On Your account, Year 3 students and graduates opt in to answer questions on topics they pick:
  internships, an employer, MSc applications, module choice. They fill Career Navigator's "Ask a senior" panel, built
  but hidden while nobody is listed, and "Ask" opens a thread that notifies them.
- **Builds on:** `CareerSenior` and `Seniors.tsx`, composer presets, notifications. It could be a Senior role on
  R-1's role screen.
- **Size:** M, both.
- **Costs and risks:** opt-in only, with name and year and no contact details. A pause switch for busy seniors.
- **How we'd know it worked:** seniors listed; questions asked through "Ask", and how many get an answer.
- **Status:** proposed.

### IDEA-18. Application dates on the calendar

- **The moment:** Hamad: "When do summer internships open? I missed NBB's last year."
- **The idea:** Opening and closing dates for the programmes on Career Navigator go on the calendar as a Careers
  type for Years 2 and 3, and each employer card says "Opens in January" or "Closes 30 November".
- **Builds on:** calendar events (a new type), the feed, Career Navigator's employers (its `checkedOn` date shows
  someone already checks them), Home's Coming up.
- **Size:** S to M, both, plus upkeep.
- **Costs and risks:** dates change every year and many employers don't publish them, so only confirmed dates, each
  with its source.
- **How we'd know it worked:** clicks on employer links in the weeks before closing dates.
- **Status:** proposed.

## Reps and the cohort

### IDEA-19. R-2: requests that close themselves

- **The moment:** Layla: "Does anyone have the 2019 Zone B MT1186 paper?" Hamad: "Is the ST2134 mock really on
  Thursday? It says not confirmed."
- **The idea:** Two kinds of request that need no written reply. "I'm looking for" a paper (module, year, zone)
  closes when a matching file is published, and tells everyone who asked or added "me too". "Is this confirmed?" on
  a date closes when a rep confirms it.
- **Builds on:** R-2's queue and "me too"; library items' `examYear` and `zone` and the publish step; events'
  `sample` flag; notifications.
- **Size:** M on top of R-2, both.
- **Costs and risks:** it needs the import's year and zone. One request per person per item.
- **How we'd know it worked:** share of requests closed this way; days from request to file.
- **Status:** proposed.

### IDEA-20. Ask the cohort: polls

- **The moment:** Mohamed: "Should emails be on by default? Which apps should the hub connect to?" A rep: "Which
  Saturday suits a revision session?"
- **The idea:** A poll block in newsletter issues: a question, two to five answers, one vote per signed-in student,
  and the counts shown after voting.
- **Builds on:** newsletter sections and blocks (D5's form editor), reactions (one per person per section, the same
  pattern), new-issue notifications.
- **Size:** S to M, both: a block, a votes table and a migration, the editor and the reader.
- **Costs and risks:** votes are kept only to stop double voting. The app shows counts, never who voted, and votes go
  with the account.
- **How we'd know it worked:** votes per poll; open product calls settled with numbers.
- **Status:** proposed.

### IDEA-21. A Sunday summary

- **The moment:** "I only open the hub when someone posts a link in the group."
- **The idea:** An opt-in email each Sunday for your year: this week's exams and deadlines, new files in your
  modules, questions you could answer and the latest issue. Reps get the same as plain text with links, to paste
  into their year's WhatsApp group.
- **Builds on:** the outbox and the mail worker (D1), a new email switch (a migration), `/calendar/upcoming`, the
  library and forum lists, a weekly CLI job beside the daily sweep.
- **Size:** M, both.
- **Costs and risks:** at most about 160 emails a week, within a small SMTP plan. It's opt-in, so it doesn't settle
  the open question on email defaults. The WhatsApp text is pasted by a person, with no API.
- **How we'd know it worked:** visits that arrive with `?from=summary`; how many switch it off.
- **Status:** proposed.

## Into students' days

### IDEA-22. R-8: links that look right in WhatsApp

- **The moment:** Hamad pastes the answer to an ST2134 question into the Year 2 group. Like every hub link, its
  preview reads "Modules, lessons, files, the newsletter and the forum…", so nobody can tell what it is.
- **The idea:** Each link previews with its own title and line: threads, files, issues, events and modules. WhatsApp,
  Telegram and iMessage read Open Graph tags from the page's HTML, and the app is a single page, so Caddy sends their
  link-preview crawlers to an API route that returns those tags. People still get the app.
- **Builds on:** Caddy (`web/deploy/Caddyfile`), the API's public reads and their visibility rules, `lib/share.ts`.
- **Size:** M, API and deployment, with tests.
- **Costs and risks:** it must never reveal hidden, pending or removed things, so reuse the public read checks and
  fall back to the general preview. Crawler names change, so keep the list in one place.
- **How we'd know it worked:** previews served (each one is a share), and the visits that follow.
- **Status:** proposed.

### IDEA-23. Install the hub on your phone · quick win

- **The moment:** "WhatsApp is on my home screen. The hub is a bookmark I forget."
- **The idea:** A web app manifest with the hub's name and icons, so "Add to Home Screen" on iPhone and Android gives
  an app icon that opens full screen. Papers kept for offline use can come later.
- **Builds on:** the existing icons and the `theme-color` tags in `index.html`. The CSP's `default-src 'self'`
  covers a manifest.
- **Size:** S, web.
- **Costs and risks:** none for a manifest. A service worker later needs care with short-lived file links and stale
  builds.
- **How we'd know it worked:** visits from the home-screen start address (`/?source=app`).
- **Status:** proposed.

### IDEA-24. Start here: Year 1's first month · quick win

- **The moment:** Layla in week one: "What's the difference between MyClass, the VLE and the student portal? When do
  I register with the University of London?"
- **The idea:** For the first six weeks of term, a "Start here" card on Year 1's Home: get your UoL portal login;
  register before the deadline on the calendar; find each module's study guide and VLE page; join your year's
  WhatsApp group through your reps; learn how exams work (zones A and B, examiners' reports, how the degree is
  classified). Ticked off in the browser, like Career Navigator's checklist.
- **Builds on:** Career Navigator's checklist (kept in the browser), the calendar's "UoL application deadline", the
  grades page's "How the classification works", the MyClass and UoL portal links.
- **Size:** S, web, with the wording from reps.
- **Costs and risks:** it must be right every September, so a rep checks it each year.
- **How we'd know it worked:** Year 1 visits to the linked pages in October.
- **Status:** proposed.

## Considered and left out

- **Study-group sign-up posts:** WhatsApp already does this well for 160 people.
- **Saving grades as a private link or a file:** on a shared computer it would undo D10's clearing on sign-out.
- **A daily past question:** worth it only once IDEA-3 has tagged questions.
- **AI summaries of examiners' reports:** waits on R-6's decision about an AI model and its budget.
- **Announcements from reps as a feature of their own:** IDEA-12 covers the urgent ones, IDEA-21 the weekly round-up
  and the newsletter the rest.

## Top five

1. **IDEA-10, R-3: your papers.** Every Year 2 and 3 student sees wrong counts today, on the hub's best feature. The
   same choice then fixes the calendar, its feed, Career Navigator and the calculator.
2. **IDEA-1: each paper with its examiners' report.** The night before an exam is when students need the hub most,
   and once the Drive import lands it's small.
3. **IDEA-22, R-8: links that look right in WhatsApp.** The cohort lives in WhatsApp, so every shared link is the
   hub's advert, and today every link looks the same. It costs nothing to run.
4. **IDEA-6: formulas in forum posts.** A statistics and maths programme can't ask its questions without them, and
   R-5 needs the same renderer.
5. **IDEA-2: search inside papers.** Finding the right paper fast is what Drive and WhatsApp can't do. Check first how
   many imported papers have text rather than scans.

IDEA-5 and IDEA-9 take a day each: give them to whoever next works on search and on Home.
