// The DSBA Newsletter: every public issue, as data. Copy uses the inline markup from lib/text.js:
//   **bold**  *italic*  ==highlighter mark==  [label](/route | https://…)
// Rules: written by students, for students. Never quote or attribute words to real staff.
// Never promise a timetable: an issue goes out when there is news, so nothing about how often or when the next one comes.
// Dummy people come from data/people.js (DUMMY_STUDENTS). Facts (unit codes, dates, counts) come from
// data/modules.js and data/calendar.js and are a snapshot as of each issue's date.
//
// Issue: { slug, number, title, date, cover, dek, summary, editors[], sections[] }
// Section: { id, label, icon, title, kind?, figure?, blocks[], aside?, after?, reactions{useful,love,laugh}, estWords? }
//   figure  an image shown beside the copy on wide screens and above it on narrow ones:
//           { src: 'demo/news/x.jpg' (relative to public/), width, height, alt, caption }
//   aside   a margin note: { type: 'note' | 'stats' | 'quote' | 'card', … }; `wide: true` gives it the figure's column.
// Section ids are the ?section= deep links (/newsletter/<slug>?section=<id>): keep them stable.
// Live sections (kind 'deadlines' | 'forum' | 'library') render data from other features at read time.
//
// The special edition is NOT in this file on purpose: it lives in ../special/ and must never be listed.
import { MODULES, getModuleStats } from '../../../data/modules.js';
import { MYCLASS_URL, UOL_PORTAL_URL } from '../../../data/people.js';

export const EDITORS = ['hawra-t', 'zainab-k', 'hussain-m']; // one editor per cohort (Year 1, 2, 3)

// What the hub holds today, counted from the data (the launch issue's "numbers" note).
const HUB_TOTALS = MODULES.reduce(
  (t, m) => {
    const s = getModuleStats(m);
    return { chapters: t.chapters + s.chapters, videos: t.videos + s.videos, notes: t.notes + s.notes };
  },
  { chapters: 0, videos: 0, notes: 0 },
);

const PILOT = {
  slug: 'pilot',
  number: 0,
  title: 'The pilot',
  date: '2026-09-29',
  cover: 'pilot',
  dek: 'A short test run before the real thing: what The DSBA Newsletter will be, and one favour to ask.',
  summary: 'The test issue: what goes into The DSBA Newsletter, a first look at the October session and a request for your ideas.',
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
          text: 'This is issue zero of The DSBA Newsletter, written by DSBA students for DSBA students. Think of it as a pilot study: a small sample, a rough instrument and a lot of questions we want you to answer.',
        },
        {
          type: 'p',
          text: 'We won’t send it on a timetable. When there is news worth your time, an issue goes out: what changed on the hub, the dates that matter for your cohort, the best of the forum and the occasional study tip that actually works. Short enough to read between lectures, and useful enough to open.',
        },
        { type: 'signoff', text: 'Hawra, Zainab and Hussain' },
      ],
      reactions: { useful: 9, love: 14, laugh: 1 },
    },
    {
      id: 'what-to-expect',
      label: 'What goes in',
      icon: 'ListBullets',
      title: 'What an issue can hold',
      blocks: [
        { type: 'p', text: 'Not every issue will have all of these. What goes in depends on what has happened.' },
        {
          type: 'list',
          items: [
            '**News from around the programme**: what changed on the hub and what is happening at BIBF.',
            '**Cohort corner**: news for Year 1, Year 2 or Year 3.',
            '**Study tips**: one technique at a time, tested on real past papers.',
            '**Deadlines and dates**: every exam and deadline, with a countdown.',
            '**Student spotlight**: a classmate on how they actually study.',
            '**From the forum** and **New in the library**: the best threads and files.',
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
          text: 'Ten papers, from EC1002 Introduction to Economics on 19 October to ST2195 Programming for Data Science on 6 November. Every date is in the [calendar](/calendar).',
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
          text: 'What would make you open The DSBA Newsletter when it lands? What should we never do again? Reply to the email or find any of us in the corridor. The best answer gets its own section.',
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
  cover: 'launch',
  dek: 'The CFA Research Challenge, our Student Council nominees, Speech Day, and a new home for everything DSBA.',
  summary:
    'BIBF is taking participants for the CFA Institute Research Challenge 2027. Several of our own are nominees for Student Council 2026/27, and they gave an amazing performance at Speech Day. DSBA Hub launches today.',
  editors: EDITORS,
  sections: [
    // ── Four stories, in this order ─────────────────────────────────────────
    {
      id: 'cfa',
      label: 'CFA Research Challenge',
      icon: 'ChartLineUp',
      title: 'BIBF is taking participants for the CFA Research Challenge',
      figure: {
        src: 'demo/news/cfa-research-challenge.jpg',
        width: 986,
        height: 701,
        alt: 'Poster for the CFA Institute Research Challenge 2027. On a dark background it reads “Research Challenge 2027” and “Let’s all strive for greatness.”, next to a grid of photos and icons including a magnifying glass, a leaf and a trophy.',
        caption: 'The CFA Institute Research Challenge 2027: “Let’s all strive for greatness.”',
      },
      blocks: [
        {
          type: 'p',
          lead: true,
          text: 'The CFA Institute Research Challenge 2027 is an annual global competition for university students, and BIBF is taking participants. Teams research a publicly listed company, write an equity research report and present their recommendation to a panel of industry professionals.',
        },
        { type: 'p', text: 'Teams progress from local rounds to regional rounds and then to global rounds.' },
        {
          type: 'p',
          text: 'It suits us. The work is the work this degree trains for: analysing a company’s numbers, building a model, and then standing up to explain what it says.',
        },
        {
          type: 'p',
          text: 'Interested? ==Ask the programme office how to join.== There are [more opportunities](/career) in Career Navigator.',
        },
      ],
      reactions: { useful: 18, love: 7, laugh: 0 },
    },
    {
      id: 'student-council',
      label: 'Student Council',
      icon: 'UsersThree',
      title: 'DSBA students are among the nominees for Student Council 2026/27',
      aside: { type: 'card', wide: true, kicker: 'Student Council', title: '2026/27', text: 'Nominees from DSBA: *several of our own.*' },
      blocks: [
        {
          type: 'p',
          lead: true,
          text: 'Several of our own are among the nominees for Student Council 2026/27. You may well know one of them from the corridor or the lecture hall.',
        },
        {
          type: 'p',
          text: 'The nominees made their case in person, at Speech Day, which is the next story. If one of them is in your class, tell them well done.',
        },
      ],
      reactions: { useful: 2, love: 31, laugh: 0 },
    },
    {
      id: 'speech-day',
      label: 'Speech Day',
      icon: 'Microphone',
      title: '“An amazing performance”: our nominees on Speech Day',
      figure: {
        src: 'demo/news/speech-day.jpg',
        width: 1080,
        height: 1350,
        alt: 'Poster for Speech Day, Student Council 2026/2027. A hand holds a microphone beside the dates: Speech Day on 28 September and winner announcements on 5 October, each from 12:30 to 2:00 PM in the Auditorium.',
        caption: 'The Speech Day poster: Speech Day on 28 September, winners announced on 5 October, both from 12:30 to 2:00 PM in the Auditorium.',
      },
      blocks: [
        {
          type: 'p',
          lead: true,
          text: 'Speech Day was on 28 September, in the Auditorium, and our nominees for Student Council 2026/27 stood up and spoke. In the words of our student rep, they ==“made an amazing performance”==.',
        },
        {
          type: 'p',
          text: 'Speaking in front of a hall is not easy, and they did it well. Thank you to everyone who stood up, and to everyone who came to listen.',
        },
        {
          type: 'p',
          text: 'The winners were announced on 5 October, from 12:30 to 2:00 PM in the Auditorium. Congratulations to every nominee.',
        },
      ],
      reactions: { useful: 4, love: 46, laugh: 1 },
    },
    {
      id: 'launch',
      label: 'DSBA Hub',
      icon: 'RocketLaunch',
      title: 'DSBA Hub launches today',
      aside: {
        type: 'stats',
        wide: true,
        title: 'The hub in numbers',
        items: [
          { value: String(MODULES.length), label: 'modules across three years' },
          { value: String(HUB_TOTALS.chapters), label: 'chapters' },
          { value: String(HUB_TOTALS.videos), label: 'video lessons' },
          { value: String(HUB_TOTALS.notes), label: 'sets of students’ notes' },
        ],
        foot: 'Counted on 6 October 2026.',
      },
      blocks: [
        {
          type: 'p',
          lead: true,
          text: 'Today the DSBA Resource Hub becomes DSBA Hub. Everything you relied on is still here: your modules, the Drive folders, students’ notes and past exams. This is what is new.',
        },
        {
          type: 'list',
          items: [
            '**A forum for all three cohorts.** Ask a question, answer one, and vote up the replies that helped. Be kind: everyone is revising.',
            '**A library that opens files inside the hub.** Study guides, students’ notes and past papers open in a built-in reader, with the original Drive file one click away.',
            '**Lessons that remember where you stopped.** The videos play inside the hub and keep your place, chapter by chapter.',
            '**Career Navigator.** The place to look for [more opportunities](/career).',
            '**The calendar and the grade calculator.** Every date in one [calendar](/calendar), and a [grade calculator](/grades) to see where your marks are heading.',
          ],
        },
        {
          type: 'p',
          text: `One honest note: DSBA Hub does not replace your email, the VLE, [MyClass](${MYCLASS_URL}), the [UoL student portal](${UOL_PORTAL_URL}) or the WhatsApp groups. It gives them one place to start.`,
        },
      ],
      reactions: { useful: 37, love: 29, laugh: 2 },
    },

    // ── Live sections: read from the calendar, the forum and the library when the page opens ──
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
      after: [{ type: 'signoff', text: 'Hawra, Zainab and Hussain, for the editorial team' }],
      estWords: 50,
      reactions: { useful: 41, love: 25, laugh: 0 },
    },
  ],
};

/** Every public issue, oldest first. */
export const ISSUES = [PILOT, LAUNCH];
