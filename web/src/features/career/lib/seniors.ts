// Seniors who answer: the topics they pick and the link that asks one of them.
import type { Senior } from '../../../api/types';

export type SeniorTopic = Senior['topics'][number];

export const TOPICS: { id: SeniorTopic; label: string }[] = [
  { id: 'internships', label: 'Internships' },
  { id: 'jobs', label: 'First jobs and interviews' },
  { id: 'msc', label: 'MSc applications' },
  { id: 'electives', label: 'Choosing Year 3 electives' },
  { id: 'modules', label: 'Modules and exams' },
];

const LABEL = new Map(TOPICS.map((t) => [t.id, t.label]));

/** "Internships, MSc applications" */
export function topicLine(topics: readonly SeniorTopic[]): string {
  return topics.map((t) => LABEL.get(t) ?? t).join(', ');
}

/** /forum/new asking this senior: they are told when the thread is posted. */
export function askSeniorLink(userId: string): string {
  return `/forum/new?senior=${encodeURIComponent(userId)}`;
}
