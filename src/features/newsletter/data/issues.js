// The DSBA Newsletter: every public issue, as data. Copy uses the inline markup from lib/text.js:
//   **bold**  *italic*  ==highlighter mark==  [label](/route | https://…)
// Rules: written by students, for students. Never quote or attribute words to real tutors or staff.
// Dummy people come from data/people.js (DUMMY_STUDENTS). Facts (unit codes, dates, counts) come from
// data/modules.js and data/calendar.js and are a snapshot as of each issue's date.
//
// Issue: { slug, number, title, date, status: 'published'|'upcoming', cover, dek, summary, editors[], sections[] }
// Section: { id, label, icon, title, kind?, blocks[], aside?, reactions{useful,love,laugh}, estWords? }
// Live sections (kind 'deadlines' | 'forum' | 'library') render data from other features at read time.
//
// The special edition is NOT in this file on purpose: it lives in ../special/ and must never be listed.
import { CONTRIBUTE_URL, UOL_PORTAL_URL } from '../../../data/people.js';

export const EDITORS = ['hawra-t', 'zainab-k', 'hussain-m']; // one editor per cohort (Year 1, 2, 3)

const PILOT = {
  slug: 'pilot',
  number: 0,
  title: 'The pilot',
  date: '2026-09-29',
  status: 'published',
  cover: 'pilot',
  dek: 'A short test run before the real thing: what The DSBA Newsletter will be, and one favour to ask.',
  summary: 'The test issue: what The DSBA Newsletter will cover every week, a first look at the October session and a request for your ideas.',
  editors: EDITORS,
  sections: [
    {
      id: 'editors-note',
      label: 'Editor’s note',
      icon: 'NotePencil',
      title: 'Testing, testing',
      blocks: [
        {
          type: 'p',
          lead: true,
          text: 'This is issue zero of The DSBA Newsletter, a weekly newsletter written by DSBA students for DSBA students. Think of it as a pilot study: a small sample, a rough instrument and a lot of questions we want you to answer.',
        },
        {
          type: 'p',
          text: 'From next week, every issue will bring what changed on the hub, the dates that matter for your cohort, the best of the forum and one study tip that actually works. Short enough to read between lectures, and useful enough to open.',
        },
        { type: 'signoff', text: 'Hawra, Zainab and Hussain' },
      ],
      reactions: { useful: 9, love: 14, laugh: 1 },
    },
    {
      id: 'what-to-expect',
      label: 'What to expect',
      icon: 'ListBullets',
      title: 'Nine sections, one coffee',
      blocks: [
        {
          type: 'list',
          items: [
            '**This week in DSBA**: what changed on the hub and around the programme.',
            '**Cohort corner**: one update each for Year 1, Year 2 and Year 3.',
            '**Study tip of the week**: one technique, tested on real past papers.',
            '**Deadlines and dates**: every exam and deadline, with a countdown.',
            '**Student spotlight**: a classmate on how they actually study.',
            '**From the forum** and **New in the library**: the best threads and files of the week.',
            '**One more thing**: usually a chart. Occasionally a pun.',
          ],
        },
      ],
      reactions: { useful: 12, love: 6, laugh: 2 },
    },
    {
      id: 'october',
      label: 'Deadlines and dates',
      icon: 'CalendarCheck',
      title: 'The October session is on the calendar',
      blocks: [
        {
          type: 'p',
          text: 'Ten papers, from EC1002 Introduction to Economics on 19 October to ST2195 Programming for Data Science on 6 November. The full countdown starts in the launch edition; until then, every date is in the [calendar](/calendar).',
        },
      ],
      reactions: { useful: 21, love: 2, laugh: 0 },
    },
    {
      id: 'feedback',
      label: 'One more thing',
      icon: 'Sparkle',
      title: 'Tell us what you want to read',
      blocks: [
        {
          type: 'p',
          text: 'What would make you open The DSBA Newsletter every week? What should we never do again? Reply to the email or find any of us in the corridor. The best answer gets its own section.',
        },
      ],
      reactions: { useful: 4, love: 11, laugh: 3 },
    },
  ],
};

const LAUNCH = {
  slug: 'launch-edition',
  number: 1,
  title: 'Launch edition',
  date: '2026-10-06',
  status: 'published',
  cover: 'launch',
  dek: 'A new home for everything DSBA, thirteen days to the first exam, and a chart nobody asked for.',
  summary:
    'DSBA Hub is live: files that open in the hub, lessons that remember where you stopped and a forum for every cohort. Plus every October exam date, a study tip and a student spotlight.',
  editors: EDITORS,
  sections: [
    {
      id: 'editors-note',
      label: 'Editor’s note',
      icon: 'NotePencil',
      title: 'Hello, and welcome to the new hub',
      blocks: [
        {
          type: 'p',
          lead: true,
          text: 'Today the DSBA Resource Hub becomes DSBA Hub, and The DSBA Newsletter becomes a proper weekly newsletter. The idea hasn’t changed: everything a DSBA student needs, gathered by students who needed it first. What has changed is that it no longer feels like a page of links.',
        },
        {
          type: 'p',
          text: 'Notes and past papers now open right inside the hub, with the original Drive file one click away. Lessons remember where you stopped. The calendar knows your exam dates and will happily put them on your phone. And there is finally a forum, so the question you didn’t ask in class can be answered by someone in your cohort at 11pm.',
        },
        {
          type: 'p',
          text: 'Thank you to everyone who replied to the pilot. You asked for every exam date in one place, and for shorter issues. We managed the first one.',
        },
        {
          type: 'p',
          text: 'This issue lands ==thirteen days before the first paper== of the October session, so we’ve kept it practical: every date for every cohort, a study tip we wish someone had given us in Year 1, and a few things worth a coffee break. Everything else can wait until November.',
        },
        { type: 'signoff', text: 'Hawra, Zainab and Hussain, for the editorial team' },
      ],
      aside: {
        type: 'note',
        title: 'Who writes The DSBA Newsletter',
        text: 'Three students, one from each cohort, plus anyone with something worth sharing. Got a tip, a story or a correction? [Start a thread in the forum](/forum/new) and we’ll read it.',
      },
      reactions: { useful: 18, love: 42, laugh: 3 },
    },
    {
      id: 'this-week',
      label: 'This week in DSBA',
      icon: 'Megaphone',
      title: 'The hub, rebuilt from the ground up',
      blocks: [
        {
          type: 'p',
          text: 'Everything you relied on is still here: your modules, the Drive folders, students’ notes, previous exams, the grade calculator and dark mode. This is what’s new.',
        },
        {
          type: 'list',
          items: [
            '**Files open in the hub.** Study guides, students’ notes and past papers open in a built-in reader, so comparing three past papers no longer means three Drive tabs. *Open original* is always one click away.',
            '**Lessons remember where you stopped.** All 337 videos, from YouTube lectures to recorded classes, play inside the hub and track your progress chapter by chapter.',
            '**Your exams, on your phone.** The October timetable is in the [calendar](/calendar) with real unit codes. Download the .ics file and every paper lands in your phone’s calendar.',
            '**Search everything.** Press Ctrl K (⌘K on a Mac) to jump to any module, file, lesson, thread or past issue of The DSBA Newsletter.',
            '**A forum for every cohort.** Ask, answer and vote up the replies that helped, filtered by module. Be kind: everyone is revising.',
          ],
        },
      ],
      aside: {
        type: 'stats',
        title: 'The hub in numbers',
        items: [
          { value: '16', label: 'modules across three years' },
          { value: '94', label: 'chapters' },
          { value: '337', label: 'video lessons' },
          { value: '11', label: 'sets of students’ notes' },
        ],
        foot: 'Counted on 6 October 2026.',
      },
      reactions: { useful: 37, love: 29, laugh: 2 },
    },
    {
      id: 'cohort-corner',
      label: 'Cohort corner',
      icon: 'UsersThree',
      kind: 'cohorts',
      title: 'Where each year stands',
      blocks: [
        {
          type: 'p',
          text: 'One update per cohort. Read yours first, then read the others: today’s Year 3s were Year 2s not long ago, and they have opinions.',
        },
      ],
      cohorts: [
        {
          year: 1,
          title: 'Four papers, 19 October to 2 November',
          moduleIds: ['economics', 'mathematics', 'statistics', 'business'],
          paragraphs: [
            'You open with EC1002 Introduction to Economics on Monday 19 October and finish with MN1178 Business and Management in a Global Context on 2 November. MT1186 Mathematical Methods and ST1215 Introduction to Mathematical Statistics sit in between.',
            'Short on time? Start with ==Differential Equations in MT1186==. At 22 videos it is the longest chapter in the module, and the easiest one to leave too late.',
          ],
        },
        {
          year: 2,
          title: 'Six papers in fifteen days',
          moduleIds: ['advanced-stats-inferential', 'business-analytics', 'advanced-stats-distribution', 'econometrics', 'information-systems', 'programming-data-science'],
          paragraphs: [
            'ST2134 Statistical Inference goes first on 23 October, and ST2195 Programming for Data Science closes the session on 6 November. ==Four of your six papers fall in the last eight days==, so plan the second week now, not when you get there.',
            'The ST2195 cheat sheet is in the library, and the ST2187 lessons are organised by block, so Block 7 on decision trees and EMV is two clicks away.',
          ],
        },
        {
          year: 3,
          title: 'No exams this session',
          moduleIds: ['machine-learning', 'market-research', 'microeconomics', 'asset-pricing', 'marketing-management', 'further-maths-economists'],
          paragraphs: [
            'Nothing on the October calendar for Year 3, which makes this the calm before your final year gets busy. Machine Learning and Further Mathematics for Economists both reward an early start, and the study guides for all six modules are in the library.',
            `Year 3 notes are still thin on the ground. If yours are tidy enough to share, [the hub takes contributions](${CONTRIBUTE_URL}).`,
          ],
        },
      ],
      reactions: { useful: 51, love: 14, laugh: 6 },
    },
    {
      id: 'study-tip',
      label: 'Study tip of the week',
      icon: 'Lightbulb',
      title: 'Mark your past paper like an examiner',
      blocks: [
        {
          type: 'p',
          text: 'Doing past papers is good. Marking them honestly is where the marks are. For many modules the University of London publishes ==examiners’ commentaries== on the VLE: what a strong answer looked like, and where most candidates lost marks. It is the closest thing we get to a marking scheme, and most of us never open it.',
        },
        {
          type: 'steps',
          items: [
            { title: 'Sit it like the real thing', text: 'One paper, timed, closed book, phone in another room. When the time is up, stop, even mid-sentence.' },
            { title: 'Mark it with the commentary open', text: 'Give yourself only the marks the commentary would. Circle every place you dropped one and write down why.' },
            { title: 'Redo only the circles, two days later', text: 'Not the whole paper: just the questions you lost marks on, from a blank page. This is the pass that sticks.' },
          ],
        },
        {
          type: 'p',
          text: 'One paper done three ways teaches you more than two papers done and never marked. Try it this week with the module that worries you most.',
        },
      ],
      aside: {
        type: 'note',
        title: 'Where the papers are',
        text: 'Previous exams for every module are in the [library](/library), next to the study guides and students’ notes.',
      },
      reactions: { useful: 64, love: 21, laugh: 1 },
    },
    {
      id: 'deadlines',
      label: 'Deadlines and dates',
      icon: 'CalendarCheck',
      kind: 'deadlines',
      title: 'The October session, paper by paper',
      // Live: getUpcomingEvents() from the calendar, fixed to the issue date.
      window: { from: '2026-10-06', to: '2026-11-30' },
      blocks: [
        {
          type: 'p',
          text: `Ten papers between 19 October and 6 November: four for Year 1, six for Year 2. Dates come from the DSBA calendar as of 6 October. Your personal timetable and exam centre details are on the [UoL student portal](${UOL_PORTAL_URL}).`,
        },
      ],
      estWords: 90,
      reactions: { useful: 88, love: 9, laugh: 0 },
    },
    {
      id: 'spotlight',
      label: 'Student spotlight',
      icon: 'Student',
      title: 'Sayed Ali M. on surviving six papers',
      profile: { studentId: 'sayed-ali-m', year: 3, line: 'Interviewed by Zainab K.' },
      blocks: [
        {
          type: 'p',
          text: 'Sayed Ali is in Year 3, which means he sat last year’s six October papers and lived to tell us about it. We asked him how.',
        },
        {
          type: 'qa',
          items: [
            {
              q: 'What did your revision fortnight actually look like?',
              a: 'Boring, on purpose. Two past papers a day, one in the morning and one after Maghrib, with a walk in between. I stopped making beautiful notes in Year 1. Ugly notes that I actually reread are worth more.',
            },
            {
              q: 'Which module surprised you?',
              a: 'ST2133. Everyone warned me about Distribution Theory, and it was hard, but it is the module that made the rest of statistics click. Once you see where the distributions come from, you stop memorising them.',
            },
            {
              q: 'What would you tell this year’s Year 2s?',
              a: 'Don’t revise in timetable order. Start with the paper that scares you most, while you still have the energy to be scared of it.',
            },
            { q: 'And after the last paper?', a: 'Sleep. Then karak with everyone who finished the same day.' },
          ],
        },
      ],
      aside: { type: 'quote', text: 'Ugly notes that I actually reread are worth more.', cite: 'Sayed Ali M., Year 3' },
      reactions: { useful: 33, love: 47, laugh: 12 },
    },
    {
      id: 'forum',
      label: 'From the forum',
      icon: 'ChatsCircle',
      kind: 'forum',
      title: 'What your cohort is asking',
      blocks: [
        {
          type: 'p',
          text: 'The threads getting the most attention right now. Know an answer? Jump in: explaining something is the fastest way to revise it.',
        },
      ],
      fallback: {
        title: 'The forum opens today',
        text: 'Ask the question you have been saving. How do you find the MGF of a gamma distribution? Which past papers repeat? Who wants a study group for EC2020? Your cohort can reply, and vote up the answers that help.',
      },
      estWords: 60,
      reactions: { useful: 22, love: 18, laugh: 4 },
    },
    {
      id: 'library',
      label: 'New in the library',
      icon: 'Books',
      kind: 'library',
      title: 'Fresh in the library',
      blocks: [
        {
          type: 'p',
          text: 'Added recently, newest first. Everything opens in the reader, with the original file one click away.',
        },
      ],
      fallback: {
        title: 'Students’ notes, all in one place',
        text: 'The library gathers every module’s study guides, past papers and the notes students have shared. These are the shared notes so far; yours could be next.',
      },
      estWords: 50,
      reactions: { useful: 41, love: 25, laugh: 0 },
    },
    {
      id: 'one-more-thing',
      label: 'One more thing',
      icon: 'Sparkle',
      kind: 'chart',
      title: 'Chart of the week: confidence, by days to the exam',
      blocks: [
        {
          type: 'p',
          text: 'We surveyed a representative sample of the editorial team (n = 3) on how sure they felt in the three weeks before last year’s first paper. The results are below. Error bars have been left out for everyone’s sake.',
        },
      ],
      chart: {
        title: 'Confidence before an exam, by days to go',
        xLabel: 'Days to the exam',
        yLabel: 'Confidence',
        // [days to exam, confidence %]
        points: [
          [21, 78], [20, 77], [19, 74], [18, 69], [17, 51], [16, 42], [15, 37], [14, 35], [13, 37], [12, 41], [11, 44],
          [10, 46], [9, 55], [8, 59], [7, 61], [6, 57], [5, 60], [4, 63], [3, 61], [2, 66], [1, 72], [0, 49],
        ],
        notes: [
          { day: 21, text: 'Three weeks. Loads of time.' },
          { day: 17, text: 'Opened a past paper.' },
          { day: 9, text: 'Found the examiners’ commentary.' },
          { day: 0, text: 'Turned over the paper.' },
        ],
        caption: 'Source: the editorial team’s group chat. Not peer reviewed.',
      },
      after: [
        {
          type: 'p',
          text: 'That’s all for this issue. Good luck to everyone sitting papers this month, and may all your p-values be small.',
        },
      ],
      estWords: 40,
      reactions: { useful: 7, love: 36, laugh: 58 },
    },
  ],
};

const EXAM_FORTNIGHT = {
  slug: 'exam-fortnight',
  number: 2,
  title: 'Exam fortnight',
  date: '2026-10-13',
  status: 'upcoming',
  cover: 'forecast',
  dek: 'Six days to the first paper: a revision plan for each cohort, an exam-day checklist and your questions, answered.',
  summary: 'Out on 13 October, six days before the first paper of the October session.',
  editors: EDITORS,
  planned: [
    'A day-by-day revision plan for each cohort',
    'The exam-day checklist: what to bring, and what to leave at home',
    'Your forum questions, answered by students who sat these papers',
    'Year 2: the countdown to ST2134 Statistical Inference',
    'One more thing: probably a chart',
  ],
  sections: [],
};

/** Every public issue, oldest first. */
export const ISSUES = [PILOT, LAUNCH, EXAM_FORTNIGHT];
