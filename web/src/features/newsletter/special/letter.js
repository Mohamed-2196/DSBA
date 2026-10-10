// The hidden special edition (Teacher’s Day): one short letter from the three cohorts.
// Rules from the student rep: never say how many people it is for, no name cards, no placeholder
// names, and address them as teachers, "the people who taught us". It stays unlisted: it is not in
// data/issues.js, so the archive, search and "latest" never see it.
export const SPECIAL = {
  slug: 'thank-you-teachers',
  heading: 'To the people who taught us',
  kicker: 'Happy Teacher’s Day',
  dek: 'A letter from the students of DSBA: Year 1, Year 2 and Year 3.',
  date: '2026-10-06',
  letter: {
    salutation: 'Dear teachers,',
    // `turn: true` sets a paragraph apart, larger and in italics, as the heart of the letter.
    paragraphs: [
      { text: 'Happy Teacher’s Day. We wanted to say something properly, and a quick thank you in the corridor didn’t feel like enough.' },
      {
        text: 'Every one of us arrived at DSBA with a different kind of nervousness. Some of us had not touched calculus in years. Some had never written a line of code. You met all of it with patience.',
      },
      { text: 'You answered the same question again as if it were the first time, and you turned “I don’t get it” into “oh”.', turn: true },
      { text: 'We are data science students, so naturally we tried to measure what that was worth. We couldn’t. Some things don’t fit in a model.' },
      { text: 'So this is only a thank you, from all three cohorts. It is small. What you gave us was not.' },
    ],
    signoff: 'With gratitude,',
    signature: 'The students of DSBA',
  },
};
