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

### IDEA-1. Each past paper with its examiners' report · quick win · **built (round 5)**

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
- **Status:** built (round 5, `round5/papers`). The Files tab lists papers by sitting (year, May or October,
  zone) with their reports and solutions; the paper page links them and has "Time me". The Drive import reads
  the session too, files a VLE folder's papers as papers, and `python -m app.cli exam-meta` fills files imported
  earlier.

### IDEA-2. Search inside papers · **built (round 5)**

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
- **Status:** built (round 5, `round5/search`).

### IDEA-3. Past questions by topic · **built (round 5)**

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
- **Status:** built (round 5, `round5/papers`), behind the switch "Past questions by topic" (off at first).
  Reps keep or remove flagged tags in Manage → Uploads.

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

### IDEA-5. Search finds lessons · quick win · **built (round 5)**

- **The moment:** Layla types "supply and demand" and gets no results, though EC1002's second chapter is Supply and
  Demand.
- **The idea:** Search (⌘K and the search page) also matches chapter and video titles, and opens the lesson.
- **Builds on:** `GET /search` (a `lesson` type from the modules' chapters) or the palette's own matching. Noora
  already looks lessons up (`noora/knowledge.ts`).
- **Size:** S, API or web.
- **Costs and risks:** none worth noting; 384 video titles is small. YouTube titles are noisy, so chapter titles rank
  first.
- **How we'd know it worked:** fewer searches with no results; lessons opened from search.
- **Status:** built (round 5, `round5/search`).

## Asking and answering

### IDEA-6. Formulas in forum posts · **built (round 4)**

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
- **Status:** built (round 4, with `round4/noora`): KaTeX formulas in forum posts and notes.

### IDEA-7. Follow a question · **built (round 5)**

- **The moment:** Layla: "Someone already asked my exact question. I voted, but I won't know when it's answered."
- **The idea:** A Follow button on threads, switched on when you vote or reply and easy to switch off. Followers hear
  when an answer is accepted, and about new replies if they choose.
- **Builds on:** thread votes, notifications (a new kind, so a migration), the Replies email switch, Your account.
- **Size:** S to M, both.
- **Costs and risks:** noise, so by default only accepted answers. One row per person and thread, in the export and
  deleted with the account.
- **How we'd know it worked:** follows per thread; fewer duplicate threads.
- **Status:** built (round 5, `round5/forum`).

### IDEA-8. Ask without your name · **built (round 5)**

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
- **Status:** built (round 5, `round5/forum`).

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

### IDEA-10. R-3: your papers, not just your year · **built (round 6)**

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
- **Status:** built on `round6/calendar2`: "Your papers" (option, electives, other years' papers and zone) on the account, or in the browser for guests. Home's countdown and modules, Coming up, the calendar, its feed (`modules=`), role fit, the grades calculator and the library's zone order follow them. A new year clears them.

### IDEA-11. R-3: dates that tell you enough · **built (round 6)**

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
- **Status:** built on `round6/calendar2`: exams carry length and rules, any date its source and when it was checked; windows (the VLE MCQs are now one entry) show "4 days left"; unconfirmed dates say to ask a student rep or the programme office.

### IDEA-12. R-3: tell people when a date changes · **built (round 5)**

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
- **Status:** built (round 5, `round5/alerts`): "Tell Year 2" on the edit form, a `date_changed` notification and a
  "Date changes" email switch.

## Revising

### IDEA-13. R-4: a revision plan to the exam date · **built (round 5)**

- **The moment:** Layla, six days before EC1002 with 72 videos unwatched: "How much do I need to do a day?"
- **The idea:** "Plan my revision" on a module spreads the unwatched chapters, and a past paper every few days, over
  the days left, as cards on the board. Watching a lesson ticks it off; falling behind spreads the rest again.
- **Builds on:** lesson progress (`lesson_views`, resume), the exam date, R-4's board, IDEA-1.
- **Size:** M, mostly web, after R-4.
- **Costs and risks:** a plan can nag, so no notifications, only the board.
- **How we'd know it worked:** plans made in the month before a session; lessons watched in the last two weeks.
- **Status:** built (round 5, `round5/board2`).

### IDEA-14. R-4: past papers as cards, scores kept private · **built (round 5)**

- **The moment:** Hamad keeps a list in his phone of the papers he's done and his marks.
- **The idea:** "Add to my board" on a paper. Marking it done asks for an optional score, which stays in the browser
  like the grades calculator's marks. The module shows "4 of 12 sittings done".
- **Builds on:** R-4's board, IDEA-1's sittings, the rule that marks stay in the browser.
- **Size:** S to M, web, after R-4.
- **Costs and risks:** whether practice scores are cleared on sign-out, as grades are (D10), is Mohamed's call.
- **How we'd know it worked:** papers marked done per student before May.
- **Status:** built (round 5, `round5/board2`).

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

### IDEA-16. Choosing your Year 3 electives · **built (round 5)**

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
- **Status:** built (round 5, `round5/onboard`).

### IDEA-17. Seniors who answer · **built (round 5)**

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
- **Status:** built (round 5, `round5/forum`).

### IDEA-18. Application dates on the calendar · **built (round 6)**

- **The moment:** Hamad: "When do summer internships open? I missed NBB's last year."
- **The idea:** Opening and closing dates for the programmes on Career Navigator go on the calendar as a Careers
  type for Years 2 and 3, and each employer card says "Opens in January" or "Closes 30 November".
- **Builds on:** calendar events (a new type), the feed, Career Navigator's employers (its `checkedOn` date shows
  someone already checks them), Home's Coming up.
- **Size:** S to M, both, plus upkeep.
- **Costs and risks:** dates change every year and many employers don't publish them, so only confirmed dates, each
  with its source.
- **How we'd know it worked:** clicks on employer links in the weeks before closing dates.
- **Status:** built on `round6/calendar2`: a Careers type, linked to a Career Navigator employer and refused without a source; the employer's card says "Opens in January" or "Closes 30 November". No dates are seeded: none of the employers publishes one yet.

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

### IDEA-20. Ask the cohort: polls · **built (round 5)**

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
- **Status:** built (round 5, `round5/forum`).

### IDEA-21. A Sunday summary · **built (round 5)**

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
- **Status:** built (round 5, `round5/alerts`): the `summary` switch (off at first), the mail worker queues it Sunday
  from 08:00 Bahrain time, `app.cli weekly-summary`, and Manage, Sunday summary for reps.

## Into students' days

### IDEA-22. R-8: links that look right in WhatsApp · **on hold**

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
- **Status:** on hold: waits for R-8, which Mohamed put on hold on 2026-10-14.

### IDEA-23. Install the hub on your phone · quick win · **built (round 5)**

- **The moment:** "WhatsApp is on my home screen. The hub is a bookmark I forget."
- **The idea:** A web app manifest with the hub's name and icons, so "Add to Home Screen" on iPhone and Android gives
  an app icon that opens full screen. Papers kept for offline use can come later.
- **Builds on:** the existing icons and the `theme-color` tags in `index.html`. The CSP's `default-src 'self'`
  covers a manifest.
- **Size:** S, web.
- **Costs and risks:** none for a manifest. A service worker later needs care with short-lived file links and stale
  builds.
- **How we'd know it worked:** visits from the home-screen start address (`/?source=app`).
- **Status:** built (round 5, `round5/onboard`).

### IDEA-24. Start here: Year 1's first month · quick win · **built (round 5)**

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
- **Status:** built (round 5, `round5/onboard`).

## Considered and left out (round 1)

- **Study-group sign-up posts:** WhatsApp already does this well for 160 people.
- **Saving grades as a private link or a file:** on a shared computer it would undo D10's clearing on sign-out.
- **A daily past question:** worth it only once IDEA-3 has tagged questions.
- **AI summaries of examiners' reports:** waits on R-6's decision about an AI model and its budget.
- **Announcements from reps as a feature of their own:** IDEA-12 covers the urgent ones, IDEA-21 the weekly round-up
  and the newsletter the rest.

## Top five (round 1)

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

## Round 2: 14 October 2026

**How I used the hub.** As a guest on a 390×844 phone and as made-up students in Years 1, 2 and 3
(`student.ideas.y*@example.com`) on a 1366×768 laptop, five days before EC1002 and nine before ST2134. Round 5 had
just merged into the local checkout, and the local database was behind it, so the forum, the library and most module
pages answered 500 while I looked (`column library_items.zone does not exist`). That's the migrations waiting for the
Drive import to finish, not a bug. Home, the countdown, Start here, Coming up and the calendar worked; for the rest I
read the code and the seed data. I also read the v1 bundle on `gh-pages`.

**What stood out.**
- Round 5 gave the hub the parts of a revision tool: papers by sitting, questions by topic, text inside papers, a
  board with plans, notes with formulas and Noora on Claude. They don't yet meet. The night before ST2134 I still
  open five screens: the countdown, the Files tab, the board, my notes and the forum.
- Year 2's countdown still says "then five more exams" for a student who sits four. IDEA-10 is still the fix.
- Notes are private, and 15 of 16 modules still have no cheat sheet. Students write the sheets the library lacks,
  then keep them to themselves.
- Noora can't see the paper you're reading, though round 5 now keeps every paper's text.
- The most common message in a year's WhatsApp group is "is there class today?". The hub knows about exams and
  deadlines, not about this week's classes.
- Nothing in the calendar says when results come out, and results day has no guide like Start here.
- Two things left out in round 1 can come back, because what they waited on is built: a daily past question (IDEA-3
  is built) and Noora on examiners' reports (R-6 is built, with a budget).

Quick wins are marked **quick win** in the heading: a day or two each.

## Round 2 · The night before an exam

### IDEA-25. One page for tonight's exam

- **The moment:** Hamad, 11 pm before ST2134: "Where is it, when, which papers haven't I done, and what did the
  examiners keep complaining about? All on one screen, please."
- **The idea:** From the countdown's "Open ST2134", in the last three days before an exam, a page for that exam: the
  time and place (or "not set yet, ask your rep"), the plan's cards still to do, the last three sittings with their
  reports and which of them you've marked done, the chapters with the most tagged past questions, and the module's
  threads tagged Exam rules or Calculators. Nothing new is stored.
- **Builds on:** the calendar event, `GET /library/papers` (sittings), the board's plan and paper cards
  (`PaperProgress`), `/library/questions` counts by chapter, the forum's tag filter, "Time me".
- **Size:** M, web only.
- **Costs and risks:** another page to keep in step with the rest. It's only as good as the times and places reps
  enter (IDEA-11).
- **How we'd know it worked:** visits in the 72 hours before each exam; papers opened from it.
- **Status:** proposed.

### IDEA-26. Noora reads the paper you're on

- **The moment:** Layla, in the 2023 Zone A EC1002 paper: "What does Q4 want, and what did the examiners say people
  got wrong on it?"
- **The idea:** On a past paper's page, "Ask Noora about this paper" sends the paper's stored text, and its
  examiners' report's text when there is one, with the question. Noora explains the method and quotes the report.
  Only papers from sittings that are over; never a paper from a session still running.
- **What changed since round 1:** "AI summaries of examiners' reports" was left out to wait for R-6's decision on a
  model and a budget. R-6 is built, with a daily cap per student and a monthly budget, and IDEA-2 keeps each paper's
  text.
- **Builds on:** `LibraryText` (`paper_text.py`), the sitting links from IDEA-1, `noora/ask.py` and its `<hub_data>`
  wrapping, the docked Noora panel, the `noora.ai` switch.
- **Size:** M, mostly API: the item id in the ask request, the text trimmed to a budget, cached per paper.
- **Costs and risks:** a paper plus its report is long, so each answer costs more; send only the pages near the
  question when the student names one, and let the existing budget refuse when it's spent. Scanned papers have no
  text, so the button hides. The live-assessment rule in Noora's prompt stays.
- **How we'd know it worked:** asks from paper pages, and the share Noora answers without "I don't know".
- **Status:** proposed.

### IDEA-27. A past question a day · quick win

- **The moment:** Hamad, three weeks out: "I won't sit a whole paper tonight, but I'd do one question on the bus."
- **The idea:** A small Home card in the six weeks before your next exam: one tagged past question from that module,
  a different one each day, opening the paper at its page. "Add to my board" keeps it for later.
- **What changed since round 1:** left out because it needed IDEA-3's tagged questions. IDEA-3 is built, behind its
  switch.
- **Builds on:** `GET /library/questions` by module, the paper viewer's page links, Home's panels, "Add to my
  board".
- **Size:** S, web only. The day's question is picked from the date, so everyone in a year sees the same one, which
  gives the group chat something to talk about.
- **Costs and risks:** hidden while a module has fewer than about ten tags, and while the switch is off.
- **How we'd know it worked:** opens of the day's question; questions added to boards from it.
- **Status:** built (round 7, `round7/daily`), behind the switch "A past question a day" (off at first), which also
  needs "Past questions by topic". "Add to my board" keeps the question's paper.

### IDEA-28. What last year revised before this exam

- **The moment:** Layla: "There are 72 Economics videos. Which ones did people actually go back to?"
- **The idea:** On the Lessons tab, in the month before an exam, a "Revisited before last year's exam" mark on the
  chapters most watched in the two weeks before that module's previous exam. Counts only, never names.
- **Builds on:** `lesson_views` (`watched_at`), the calendar's past exam dates per module, the Lessons tab.
- **Size:** S to M, both: one aggregate query, a mark on the chapter list.
- **Costs and risks:** shown only when at least ten students watched, so no one person can be singled out. It needs
  one exam season of data, so it starts paying off in May.
- **How we'd know it worked:** views of marked chapters against unmarked ones in the month before.
- **Status:** proposed.

## Round 2 · Notes into revision

### IDEA-29. Share a note with your module

- **The moment:** Reem wrote a one-page Microeconomics formula sheet in her notes: "Others need this. I'm not
  exporting a PDF and uploading it."
- **The idea:** "Share with the module" on a note publishes a copy to the module's library as notes, credited to
  you or not, after the usual review. Later edits ask "Update the shared copy?". The note itself stays private.
- **Builds on:** notes (Markdown with KaTeX, attached to a module), the library's notes kind, `author_name`, the review
  queue in Manage, the formula renderer.
- **Size:** M, both: a library item whose body is Markdown (or a stored rendered copy), the share step, the reader.
- **Costs and risks:** review load for reps, as with uploads. The shared copy is public, so the dialog says so. Copied
  study guides get the usual rejection.
- **How we'd know it worked:** modules with a cheat sheet by May; downloads and views of shared notes.
- **Status:** proposed.

### IDEA-30. Flip cards from your notes

- **The moment:** Hamad uses Anki for definitions: "I type every ST2133 distribution twice: once in my notes, once
  in Anki."
- **The idea:** A line written `term :: meaning` in a note becomes a card. "Practise" on the note flips through them,
  formulas drawn, with "Again" and "Got it"; what you got right is kept in the browser. "Export for Anki" downloads a
  tab-separated file Anki imports.
- **Builds on:** notes and their Markdown, KaTeX, the browser-only rule for marks (like grades and practice scores).
- **Size:** S for the Anki export alone (a quick win); M with the practise screen. Web only.
- **Costs and risks:** none on the server. No spaced-repetition schedule; Anki does that better.
- **How we'd know it worked:** notes with `::` lines; exports and practise sessions in the month before exams.
- **Status:** proposed.

## Round 2 · A normal week

### IDEA-31. Is there class today?

- **The moment:** Layla, Sunday 7:30 am: "Is Business on today or did the lecturer cancel? Someone said something in
  the group last night."
- **The idea:** A rep marks a class change (cancelled, moved, online, new room) for a module on a day. It shows at the
  top of Home for that year on that day, on the module page, and goes out as a notification to that year, using the
  date-change alert's rules.
- **Builds on:** calendar events (a `class` type, one day, with time and place), IDEA-12's `date_changed` notify path
  and its "Tell Year 2" box, Home's countdown area, the rep's event form.
- **Size:** S to M, both: an event type and a migration, a Home banner.
- **Costs and risks:** a rep has to post it, so it only works if posting is faster than WhatsApp: two taps from the
  module. No regular timetable: MyClass already has one, and keeping a second copy would rot.
- **How we'd know it worked:** class changes posted per week; notifications opened before 9 am.
- **Status:** proposed.

### IDEA-32. Ask about this lesson

- **The moment:** Hamad, 14 minutes into an ST2134 video: "Why is the MLE biased here?" He wants to ask about this
  video, and see if someone already did.
- **The idea:** "Ask about this lesson" under a lesson opens the composer with the module and the lesson filled in.
  The thread links back to the lesson, and the lesson lists its threads, answered first.
- **Builds on:** stable lesson ids (`round4/lesson-ids`), the composer's presets (`/forum/new?module=…`), forum
  threads' `module_id`, the lesson page, follow (IDEA-7).
- **Size:** M, both: an optional `lesson_id` on threads and a migration, a filter, the lesson panel.
- **Costs and risks:** moderation as usual. A hidden lesson hides its panel, not its threads.
- **How we'd know it worked:** threads with a lesson; how often a lesson's existing thread is opened instead of a new
  one being asked.
- **Status:** proposed.

### IDEA-33. Every deadline on my board in one go · quick win

- **The moment:** Hamad at the start of term: "I added the Business Analytics MCQ to my board. Now I have to do the
  other eight by hand."
- **The idea:** "Add this term's deadlines" on the board: every deadline and mock for your year from today to the end
  of the session becomes a dated card, skipping any already there.
- **Builds on:** `GET /calendar/events?type=deadline` for the year, `POST /board/cards` with `link_type` event (what
  "Add to my board" sends), the board's due dates.
- **Size:** S, web only.
- **Costs and risks:** a crowded To do column, so it lists what it will add and lets you untick. Follows IDEA-10's
  picks when that's built.
- **How we'd know it worked:** boards with event cards; deadline cards moved to Done before their date.
- **Status:** proposed.

### IDEA-34. This week, on Home · quick win

- **The moment:** "I switched the Sunday email off. I'd still like to see the week at a glance when I open the hub."
- **The idea:** A "This week" card on Home for every visitor, signed in or not: the Sunday summary's sections for
  your year (dates, new files, questions to answer, the latest issue), refreshed on Sunday.
- **Builds on:** `services/summary.build()` for a year, today behind `summary_share` at `/summary/preview`; a public
  read of the same thing for the current week, cached per year.
- **Size:** S, both.
- **Costs and risks:** none new: the summary already leaves out anything a guest can't read and features that are
  off.
- **How we'd know it worked:** clicks from the card; visits on Sundays and Mondays.
- **Status:** proposed.

### IDEA-35. Hear about it on your phone

- **The moment:** Layla installed the hub (IDEA-23): "WhatsApp buzzes. The hub never does, so I forget it's there."
- **The idea:** For the installed hub, "Notify me on this phone" on Your account sends the notifications you'd get by
  email (date changes, class changes, accepted answers, a reply) as phone notifications. Each kind has its own
  switch, beside the email ones.
- **Builds on:** the PWA's service worker, the outbox and its worker (a push channel beside email), the email switches
  in preferences, notification kinds.
- **Size:** M, both: Web Push with VAPID keys, a subscriptions table and a migration, the worker step, the switches.
- **Costs and risks:** free to send. On iPhone it works only from the home-screen app (iOS 16.4 and later). A push
  subscription is personal data: in the export, gone with the account, and removed when the browser rejects it. Off
  until the student turns it on, so it doesn't settle the open email-default question.
- **How we'd know it worked:** phones subscribed; notifications opened from push compared with email.
- **Status:** proposed.

## Round 2 · Results day and after

### IDEA-36. Results day, explained · quick win

- **The moment:** Hamad, the morning results come out: "I got 38 in EC2020. Is that a resit? When do I register,
  and can I ask for a re-mark?"
- **The idea:** A "Results day" guide like Start here, shown on Home from the results date for two weeks: how to read
  the UoL results, what a mark under 40 means and what the grades calculator says about it, the resit registration
  deadline, how to ask for a verification of marks, and whom to talk to at BIBF. The results release dates go on the
  calendar.
- **Builds on:** the Start here pattern (`data/guides.ts`, ticks kept in the browser), calendar events (an `event`
  per release date), the grades calculator's resit rules and what-if targets.
- **Size:** S, web, with the wording from reps and the UoL dates.
- **Costs and risks:** it must be right each session, so a rep checks it in May and October. It mustn't sound like
  official advice: it says where the official rules are.
- **How we'd know it worked:** visits to the guide and to the grades page in results week.
- **Status:** built (round 7, `round7/results`). The results dates are `event`s titled "UoL results released";
  the seed has two, marked not confirmed, for a rep to correct.

### IDEA-37. Your projected class in Career Navigator · quick win

- **The moment:** Reem, looking at an MSc: "It says 'a 2:1 or above'. Am I on track?"
- **The idea:** Career Navigator's further study card reads the grades calculator's marks from this browser and says
  "On your marks so far: Upper second, 2.4 marks clear of a First's threshold" or "Enter your marks". Nothing leaves
  the browser.
- **Builds on:** the calculator's stored marks and `classify()` / `targetsForRemaining()`, Career Navigator's
  `furtherStudy` card, which already links to the calculator.
- **Size:** S, web only.
- **Costs and risks:** marks are cleared on sign-out (D10), so the card says when it has none. No server change, no
  new personal data.
- **How we'd know it worked:** clicks from the card to the calculator and back.
- **Status:** built (round 7, `round7/results`). The same projection shows on the Results day guide.

## Round 2 · For the rep

### IDEA-38. You asked, we did · quick win

- **The moment:** Layla: "I asked for the 2019 MT1186 paper a month ago. Does anyone read these?" Mohamed: "We
  answered 30 requests this month and nobody knows."
- **The idea:** The requests page opens with "Done this month" (answered requests, newest first, with how many said
  "me too"), and the newsletter editor gets a block that pulls the same list into an issue.
- **Builds on:** `GET /requests` with status answered, me-too counts, newsletter blocks (the poll block's pattern).
- **Size:** S, both.
- **Costs and risks:** none; answered requests are already public.
- **How we'd know it worked:** new requests after an issue with the block; me-too clicks.
- **Status:** built (round 7, `round7/reps`), behind the switch "You asked, we did" (off at first): the last 30
  days on /requests, and a "Requests done" live section for issues (the 30 days up to the issue date).

### IDEA-39. What's missing, for the rep

- **The moment:** Mohamed on a Sunday with an hour: "What's the most useful gap to fill this week?"
- **The idea:** A "Gaps" screen in Manage that lists, by module: sittings with a paper but no examiners' report,
  papers with no text (scans), modules with no cheat sheet or no lessons, dates still "Not confirmed" within 30 days,
  and the open requests with the most "me too". Each line links to where you fix it.
- **Builds on:** `/library/papers`, `LibraryText.status`, the modules' resources and lesson counts, events' `sample`
  flag, requests' me-too counts, Manage and its boxes (`content.edit`, `library.manage`, `calendar.manage`).
- **Size:** M, both: one read endpoint and a Manage screen.
- **Costs and risks:** none for students. Searches that found nothing would be useful too, but logging what people
  search is personal data, so leave that out.
- **How we'd know it worked:** gaps closed per month; fewer "Not confirmed" dates in exam weeks.
- **Status:** built (round 7, `round7/reps`): the Gaps tab in Manage, a part per box held (library, lessons,
  calendar, requests). It also lists confirmed exams in the next 90 days without a time or place.

## Considered and left out (round 2)

- **A weekly class timetable:** MyClass has it, and a second copy would go stale. IDEA-31 covers the changes only.
- **Saving papers for offline use:** connections in Bahrain are good, and short-lived file links make it fiddly.
- **"Share to WhatsApp" buttons:** part of R-8, on hold.
- **Study streaks and leaderboards:** they nag, and lesson views are the only signal.
- **Anonymous logging of searches with no results:** see IDEA-39.

## Top five (round 2)

Before any of these, IDEA-10 (your papers) is still the most-felt gap from round 1: every Year 2 and 3 countdown is
wrong.

1. **IDEA-25: one page for tonight's exam.** Round 5 built the parts; this makes them one place on the night that
   matters most, with nothing new stored.
2. **IDEA-29: share a note with your module.** It turns private notes into the cheat sheets 15 modules lack, through
   the review queue that already exists.
3. **IDEA-31: is there class today?** The question the hub can answer every day, not just in exam weeks, and it
   reuses IDEA-12's alerts.
4. **IDEA-26: Noora reads the paper you're on.** The paper text and the AI budget are both there; this is where
   students get stuck.
5. **IDEA-27: a past question a day.** A day's work that brings people back daily, once the topic switch is on.

IDEA-33, IDEA-34, IDEA-37 and IDEA-38 are a day each: give them to whoever next works on the board, Home, Career
Navigator and requests.

## Round 14: the study core (from the UI/UX review, 19 October 2026)

These came from the UI/UX review's round 14 (`docs/reviews/ui-ux.md`, UX-66 on). That review covered the sections
students open several times a day, judged against VLE, WhatsApp and a Drive folder. The fixes there need no new
data; these do, so they wait for Mohamed. They don't repeat IDEA-25 (one page for tonight's exam) or IDEA-29 (share
a note with your module), which they would sit well beside.

### IDEA-40. Pick up where you left off · quick win

- **The moment:** Sara, between lectures, on her phone: "I had the 2019 ST2133 paper and my MGF note open last
  night. Where were they?" Today Home can't help unless she turned lesson progress on, and the palette opens empty.
- **The idea:** keep the last eight things opened in this browser: papers and files, notes, threads and lessons.
  Show them as "Recent" when ⌘K opens with no query, and as an optional Home block, "Pick up where you left off".
  Nothing goes to the server, so it isn't tracking and needs no opt-in. Clear it with the rest of local data on
  sign-out.
- **Builds on:** `useStored`/`removeStored` (`src/state`), the palette's groups, Home's blocks (`home/blocks.ts`).
- **Size:** S, web only.
- **Costs and risks:** one more Home block. Shared computers: cleared on sign-out, and a guest's list stays in the
  browser.
- **How we'd know it worked:** palette opens that end on a Recent item. The Home block kept on rather than hidden.
- **Status:** proposed.

### IDEA-41. Notes that know their module

- **The moment:** Hamad writes a note on chapter 2 in the notebook. A week later, on ST2133's page and on the
  chapter's lesson, there's no sign of it, and the notebook list says "Untitled note".
- **The idea:** give a note an optional module, and chapter, picked from the note's menu. A note started from a
  lesson's "Write a longer one" or a paper's "Annotate in my notebook" gets them already set. Then show "Your notes"
  on the module's Overview, on the chapter's lessons and on the paper's page (your annotations of this paper). Filter
  the notes list by module.
- **Builds on:** notes and notebooks, the lesson's quick notes (which already belong to a lesson), the paper's
  Annotate action, the module page's Overview (UX-69).
- **Size:** M: a column on notes with a migration, an API filter and three web placements.
- **Costs and risks:** another field students may ignore. Setting it automatically from where the note was started
  covers most cases.
- **How we'd know it worked:** the share of notes with a module, and notes opened from a module or paper page.
- **Status:** proposed.

### IDEA-42. Your threads: following and mine · quick win

- **The moment:** Layla asked about Lagrange multipliers on Monday and follows two other threads. On Wednesday she
  wants all three, and the forum offers years, categories and "No replies yet", but not "mine".
- **The idea:** a "Yours" tab in the forum list: threads you started, replied to or follow, newest activity first,
  with an unread dot where there's a reply you haven't seen. On phones it's the first tab after All.
- **Builds on:** follows (IDEA-7), notifications (they already know what's unread), the forum list's tabs.
- **Size:** S: a list filter in the API and a tab.
- **Costs and risks:** none beyond one more tab. The tab row already scrolls on phones (UX-62).
- **How we'd know it worked:** visits to the tab. Replies posted within a day of the notification.
- **Status:** built (`round14/forum`): the Yours tab after All (signed in), newest activity first, with a dot and a
  bold title where a notification about the thread is unread; opening the thread reads them.

### IDEA-43. The last lists you saw, without a connection

- **The moment:** Yusuf opens the hub on campus wifi that has just dropped. He gets a spinner, though he looked at
  ST2133's sittings an hour ago.
- **The idea:** persist the query cache for the core lists (My modules, a module's sittings and files, the forum's
  first page, Up next) in IndexedDB for 24 hours. Show them at once with "Showing what you saw at 10:42" while they
  refresh. Files themselves are not stored. Round 2 left out saving papers offline; this is only the lists, so the
  short-lived file links don't matter.
- **Builds on:** TanStack Query's persister, the service worker that already caches the shell, `QueryError` for the
  failed refresh.
- **Size:** S to M, web only.
- **Costs and risks:** stale data shown as current. The time stamp line handles it, and private lists (notes) stay
  out of the cache.
- **How we'd know it worked:** fewer spinners on a cold load, and the time to first content on a throttled phone.
- **Status:** proposed.
