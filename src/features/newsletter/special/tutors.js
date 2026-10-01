// The special edition's tutor cards: ONE array, in display order. Fill these in before the edition is
// shared (after the reveal). Each entry: the tutor's name, the module(s) they teach, the students'
// message, and who it's from. Keep messages to two or three sentences; cards grow to fit.
// Words in `message` must come from students (never invent words for, or about, a tutor).
const PLACEHOLDER_MESSAGE =
  'Placeholder for the students’ message to this tutor. Replace it with two or three sentences: a moment from class, something they said that stayed with us, what we’ll carry into the next exam and the next job.';

export const TUTORS = [
  { name: 'Tutor name 01', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 02', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 03', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 04', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 05', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 06', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 07', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 08', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 09', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 10', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 11', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 12', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 13', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 14', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 15', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 16', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
  { name: 'Tutor name 17', module: 'Module they teach (to fill in)', message: PLACEHOLDER_MESSAGE, from: 'From the students of DSBA' },
];

export const SPECIAL = {
  slug: 'thank-you-tutors',
  title: 'A special edition: to the 17 people who taught us',
  heading: 'To the 17 people who taught us',
  dek: 'An open letter from the students of DSBA, on Teachers’ Day.',
  date: '2026-10-06',
  letter: {
    salutation: 'Dear tutors,',
    paragraphs: [
      'For the last few weeks we have been building something in secret. You saw part of it today: a new study hub, a newsletter, a forum. All of it is real, and all of it is yours to use. But the launch was also a cover story. We needed a reason to get the seventeen of you into one room on Teachers’ Day without anyone suspecting a thing.',
      'This is the part we were hiding.',
      'Every one of us arrived at DSBA with a different kind of nervousness. Some of us had not touched calculus in years. Some had never written a line of R. Some were the first in our families to go to university, studying for a University of London degree in Manama, learning statistics in a second language. You met all of it with more patience than we always deserved.',
      'You answered the same question for the fourth time as if it were the first. You stayed after class. You recorded lectures so we could watch them again at one in the morning, the night before an exam. You turned “I don’t get it” into “oh”.',
      'We are data science students, so naturally we tried to measure it. We couldn’t. Some things don’t fit in a model.',
      'So instead, here are seventeen notes, one for each of you, from the students you taught. They are small. What you gave us was not.',
    ],
    signoff: 'With gratitude, and with love,',
    signature: 'The students of DSBA',
  },
};
