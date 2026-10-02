// Career Navigator: "Ask a senior". Year 3 students come from the shared dummy students (src/data/people.js);
// the two recent graduates are sample profiles in the same style (common first name + initial). Nobody here is
// a real person, and nobody is staff.
import { getStudent } from '../../../data/people.js';

// `studentId` links a mentor to a shared dummy student (name and cohort come from there).
const SENIORS = [
  {
    id: 'hussain-m',
    studentId: 'hussain-m',
    short: 'Hussain',
    headline: 'Landed an internship in risk',
    helps: 'Applying for risk internships, what the interviews asked and what the first weeks were like.',
    topics: ['Risk', 'Internships', 'Interviews'],
    ask: 'How did you get a risk internship?',
  },
  {
    id: 'sayed-ali-m',
    studentId: 'sayed-ali-m',
    short: 'Sayed Ali',
    headline: 'Building a Power BI portfolio',
    helps: 'Choosing portfolio projects, setting up Power BI and planning for the PL-300 exam.',
    topics: ['Power BI', 'Portfolio', 'PL-300'],
    ask: 'Which Power BI projects are worth putting on a CV?',
  },
  {
    id: 'rashed-q',
    name: 'Rashed Q.',
    short: 'Rashed',
    badge: 'Recent graduate',
    headline: 'Moved from DSBA into a first analyst job',
    helps: 'SQL questions in analyst interviews, how to read a job ad and what to learn before day one.',
    topics: ['First job', 'SQL', 'Job ads'],
    ask: 'What SQL questions come up in a first analyst interview?',
  },
  {
    id: 'dalal-n',
    name: 'Dalal N.',
    short: 'Dalal',
    badge: 'Recent graduate',
    headline: 'Went on to an MSc',
    helps: 'Choosing a course, writing a personal statement and asking for references.',
    topics: ['MSc', 'Applications', 'Personal statement'],
    ask: 'How do I choose an MSc after DSBA?',
  },
];

/** Sample mentors with their display name and cohort resolved. year: 3 for a current Year 3 student, null for a graduate. */
export function getSeniors() {
  return SENIORS.map((s) => {
    const student = s.studentId ? getStudent(s.studentId) : null;
    return { ...s, name: student?.name || s.name, year: student ? student.year : null };
  });
}
