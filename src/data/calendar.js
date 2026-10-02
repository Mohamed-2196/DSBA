// DSBA Hub — academic calendar, extracted from v1 src/legacy/components/Calander/Calander.jsx.
// GENERATED once by /home/claude/v2-spec/gen-data.mjs and verified by verify-data.mjs.
// All 46 v1 events, sorted by date, typed. Cleaned titles keep the v1 original (v1Title);
// v1Color is the v1 dot colour (red/blue/green/gold), kept for traceability only.
//
// CalendarEvent: { id, date: 'YYYY-MM-DD', title, type, year: 1|2|3|null, moduleId|null, unitCode|null }
//   year null = applies to everyone (breaks, term dates, UoL deadlines).

export const EVENT_TYPES = {
  exam: { label: 'Exam', token: '--alert', color: 'var(--alert)' },
  mock: { label: 'Mock exam', token: '--cobalt', color: 'var(--cobalt)' },
  revision: { label: 'Revision', token: '--signal', color: 'var(--signal)' },
  deadline: { label: 'Deadline', token: '--highlight', color: 'var(--highlight)' },
  break: { label: 'Break', token: '--ink-3', color: 'var(--ink-3)' },
  term: { label: 'Term dates', token: '--ink-2', color: 'var(--ink-2)' },
};

export const EVENTS = [
  { id: '2024-12-04-statistics-deadline', date: '2024-12-04', title: 'First day of Stats MCQ on VLE', type: 'deadline', year: 1, moduleId: 'statistics', unitCode: 'ST1215', v1Color: 'gold', v1Title: 'First Day of Stats MCQ on VLE' },
  { id: '2024-12-05-business-mock', date: '2024-12-05', title: 'Business mock exam', type: 'mock', year: 1, moduleId: 'business', unitCode: 'MN1178', v1Color: 'red', v1Title: 'Business Mock Exam' },
  { id: '2024-12-07-statistics-mock', date: '2024-12-07', title: 'Statistics mock exam', type: 'mock', year: 1, moduleId: 'statistics', unitCode: 'ST1215', v1Color: 'red', v1Title: 'Statistics Mock Exam' },
  { id: '2024-12-12-economics-mock', date: '2024-12-12', title: 'Economics & Arabic exams', type: 'mock', year: 1, moduleId: 'economics', unitCode: 'EC1002', v1Color: 'red', v1Title: 'Economics & Arabic Exams' },
  { id: '2024-12-14-mathematics-mock', date: '2024-12-14', title: 'Math mock exam', type: 'mock', year: 1, moduleId: 'mathematics', unitCode: 'MT1186', v1Color: 'red', v1Title: 'Math Mock Exam' },
  { id: '2024-12-16-break', date: '2024-12-16', title: 'Mid-year break', type: 'break', year: null, moduleId: null, unitCode: null, v1Color: 'green', v1Title: 'Mid Year Break' },
  { id: '2025-01-05-term', date: '2025-01-05', title: 'Classes resume', type: 'term', year: null, moduleId: null, unitCode: null, v1Color: 'blue', v1Title: 'Classes Resume' },
  { id: '2025-02-15-statistics-deadline', date: '2025-02-15', title: 'Last day of Stats MCQ on VLE', type: 'deadline', year: 1, moduleId: 'statistics', unitCode: 'ST1215', v1Color: 'gold', v1Title: 'Last Day of Stats MCQ on VLE' },
  { id: '2025-02-27-economics-mock', date: '2025-02-27', title: 'Econ second mock exam', type: 'mock', year: 1, moduleId: 'economics', unitCode: 'EC1002', v1Color: 'gold' },
  { id: '2025-03-06-statistics-mock', date: '2025-03-06', title: 'Stats second mock exam', type: 'mock', year: 1, moduleId: 'statistics', unitCode: 'ST1215', v1Color: 'gold' },
  { id: '2025-03-13-mathematics-mock', date: '2025-03-13', title: 'Math second mock exam', type: 'mock', year: 1, moduleId: 'mathematics', unitCode: 'MT1186', v1Color: 'gold' },
  { id: '2025-03-19-economics-mock', date: '2025-03-19', title: 'Econ third mock exam', type: 'mock', year: 1, moduleId: 'economics', unitCode: 'EC1002', v1Color: 'gold' },
  { id: '2025-03-20-business-mock', date: '2025-03-20', title: 'Business comprehensive mock exam', type: 'mock', year: 1, moduleId: 'business', unitCode: 'MN1178', v1Color: 'gold', v1Title: 'Business Comprehensive mock exam' },
  { id: '2025-03-27-statistics-mock', date: '2025-03-27', title: 'Stats third mock exam', type: 'mock', year: 1, moduleId: 'statistics', unitCode: 'ST1215', v1Color: 'gold', v1Title: 'stats third mock exam' },
  { id: '2025-04-03-mathematics-mock', date: '2025-04-03', title: 'Mathematical Methods third mock test', type: 'mock', year: 1, moduleId: 'mathematics', unitCode: 'MT1186', v1Color: 'gold', v1Title: 'Mathmatical Methods third mock Test' },
  { id: '2025-04-09-economics-revision', date: '2025-04-09', title: 'Econ third mock test and LSE revision', type: 'revision', year: 1, moduleId: 'economics', unitCode: 'EC1002', v1Color: 'green', v1Title: 'Econ third mock Test and LSE revision' },
  { id: '2025-04-21-statistics-revision', date: '2025-04-21', title: 'Mathematical Statistics LSE revision', type: 'revision', year: 1, moduleId: 'statistics', unitCode: 'ST1215', v1Color: 'green' },
  { id: '2025-04-22-business-revision', date: '2025-04-22', title: 'Business & Management LSE revision', type: 'revision', year: 1, moduleId: 'business', unitCode: 'MN1178', v1Color: 'green', v1Title: 'Business & management LSE revision' },
  { id: '2025-04-24-mathematics-revision', date: '2025-04-24', title: 'Mathematical Methods LSE revision', type: 'revision', year: 1, moduleId: 'mathematics', unitCode: 'MT1186', v1Color: 'green', v1Title: 'Mathmatical Methods LSE revision' },
  { id: '2025-04-30-economics-exam', date: '2025-04-30', title: 'Economics final exam', type: 'exam', year: 1, moduleId: 'economics', unitCode: 'EC1002', v1Color: 'red', v1Title: 'Economics Final Test' },
  { id: '2025-05-08-mathematics-exam', date: '2025-05-08', title: 'Mathematical Methods final exam', type: 'exam', year: 1, moduleId: 'mathematics', unitCode: 'MT1186', v1Color: 'red', v1Title: 'Mathmatical Methods Final Test' },
  { id: '2025-05-09-business-exam', date: '2025-05-09', title: 'Business final exam', type: 'exam', year: 1, moduleId: 'business', unitCode: 'MN1178', v1Color: 'red', v1Title: 'Business Final Test' },
  { id: '2025-05-13-statistics-exam', date: '2025-05-13', title: 'Statistics final exam', type: 'exam', year: 1, moduleId: 'statistics', unitCode: 'ST1215', v1Color: 'red', v1Title: 'Statistics Final Test' },
  { id: '2025-11-01-deadline', date: '2025-11-01', title: 'UoL application deadline', type: 'deadline', year: null, moduleId: null, unitCode: null, v1Color: 'red', v1Title: 'UOL application deadline' },
  { id: '2025-12-16-break', date: '2025-12-16', title: 'Mid-year break', type: 'break', year: null, moduleId: null, unitCode: null, v1Color: 'green', v1Title: 'Mid Year Break' },
  { id: '2026-01-04-term', date: '2026-01-04', title: 'Classes resume', type: 'term', year: null, moduleId: null, unitCode: null, v1Color: 'gold' },
  { id: '2026-05-05-business-analytics-exam', date: '2026-05-05', title: 'Business Analytics final exam', type: 'exam', year: 2, moduleId: 'business-analytics', unitCode: 'ST2187', v1Color: 'blue', v1Title: 'Business Analytics Final Test' },
  { id: '2026-05-06-statistics-exam', date: '2026-05-06', title: 'Introduction to Mathematical Statistics final exam', type: 'exam', year: 1, moduleId: 'statistics', unitCode: 'ST1215', v1Color: 'red', v1Title: 'Introduction to mathematical Statistics Final Test' },
  { id: '2026-05-08-economics-exam', date: '2026-05-08', title: 'Economics final exam', type: 'exam', year: 1, moduleId: 'economics', unitCode: 'EC1002', v1Color: 'red', v1Title: 'Economics Final Test' },
  { id: '2026-05-11-business-exam', date: '2026-05-11', title: 'Business and Management final exam', type: 'exam', year: 1, moduleId: 'business', unitCode: 'MN1178', v1Color: 'red', v1Title: 'Business and management Final Test' },
  { id: '2026-05-12-mathematics-exam', date: '2026-05-12', title: 'Mathematical Methods final exam', type: 'exam', year: 1, moduleId: 'mathematics', unitCode: 'MT1186', v1Color: 'red', v1Title: 'Mathmatical Methods Final Test' },
  { id: '2026-05-14-advanced-stats-distribution-exam', date: '2026-05-14', title: 'Distribution Theory final exam', type: 'exam', year: 2, moduleId: 'advanced-stats-distribution', unitCode: 'ST2133', v1Color: 'blue', v1Title: 'Distribution theory Final Test' },
  { id: '2026-05-18-econometrics-exam', date: '2026-05-18', title: 'Econometrics final exam', type: 'exam', year: 2, moduleId: 'econometrics', unitCode: 'EC2020', v1Color: 'blue', v1Title: 'Econometrics Final Test' },
  { id: '2026-05-21-information-systems-exam', date: '2026-05-21', title: 'Information Systems final exam', type: 'exam', year: 2, moduleId: 'information-systems', unitCode: 'IS2184', v1Color: 'blue', v1Title: 'Information System Final Test' },
  { id: '2026-05-22-programming-data-science-exam', date: '2026-05-22', title: 'Programming final exam', type: 'exam', year: 2, moduleId: 'programming-data-science', unitCode: 'ST2195', v1Color: 'blue', v1Title: 'Programming Final Test' },
  { id: '2026-06-10-advanced-stats-inferential-exam', date: '2026-06-10', title: 'Statistical Inference final exam', type: 'exam', year: 2, moduleId: 'advanced-stats-inferential', unitCode: 'ST2134', v1Color: 'blue', v1Title: 'Statistical Inference Final Test' },
  { id: '2026-10-19-economics-exam', date: '2026-10-19', title: 'EC1002 Introduction to Economics (October exam)', type: 'exam', year: 1, moduleId: 'economics', unitCode: 'EC1002', v1Color: 'red' },
  { id: '2026-10-22-mathematics-exam', date: '2026-10-22', title: 'MT1186 Mathematical Methods (October exam)', type: 'exam', year: 1, moduleId: 'mathematics', unitCode: 'MT1186', v1Color: 'red' },
  { id: '2026-10-23-advanced-stats-inferential-exam', date: '2026-10-23', title: 'ST2134 Advanced Statistics: Statistical Inference (October exam)', type: 'exam', year: 2, moduleId: 'advanced-stats-inferential', unitCode: 'ST2134', v1Color: 'blue' },
  { id: '2026-10-26-statistics-exam', date: '2026-10-26', title: 'ST1215 Introduction to Mathematical Statistics (October exam)', type: 'exam', year: 1, moduleId: 'statistics', unitCode: 'ST1215', v1Color: 'red' },
  { id: '2026-10-27-business-analytics-exam', date: '2026-10-27', title: 'ST2187 Business Analytics, Applied Modelling and Prediction (October exam)', type: 'exam', year: 2, moduleId: 'business-analytics', unitCode: 'ST2187', v1Color: 'blue' },
  { id: '2026-10-30-advanced-stats-distribution-exam', date: '2026-10-30', title: 'ST2133 Advanced Statistics: Distribution Theory (October exam)', type: 'exam', year: 2, moduleId: 'advanced-stats-distribution', unitCode: 'ST2133', v1Color: 'blue' },
  { id: '2026-11-02-business-exam', date: '2026-11-02', title: 'MN1178 Business and Management in a Global Context (October exam)', type: 'exam', year: 1, moduleId: 'business', unitCode: 'MN1178', v1Color: 'red' },
  { id: '2026-11-03-econometrics-exam', date: '2026-11-03', title: 'EC2020 Elements of Econometrics (October exam)', type: 'exam', year: 2, moduleId: 'econometrics', unitCode: 'EC2020', v1Color: 'blue' },
  { id: '2026-11-05-information-systems-exam', date: '2026-11-05', title: 'IS2184 Information Systems Management (October exam)', type: 'exam', year: 2, moduleId: 'information-systems', unitCode: 'IS2184', v1Color: 'blue' },
  { id: '2026-11-06-programming-data-science-exam', date: '2026-11-06', title: 'ST2195 Programming for Data Science (October exam)', type: 'exam', year: 2, moduleId: 'programming-data-science', unitCode: 'ST2195', v1Color: 'blue' },
];

/** Local-midnight Date for an event (dates are calendar days, no time zone). */
export function eventDate(e) {
  const [y, m, d] = e.date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Events relevant to a year: that year's events plus everyone-events (year null). year null → all. */
export function getEventsForYear(year) {
  if (year == null) return EVENTS;
  return EVENTS.filter((e) => e.year == null || e.year === Number(year));
}

/** All events for a module, by date. */
export function getEventsForModule(moduleId) {
  return EVENTS.filter((e) => e.moduleId === moduleId);
}
