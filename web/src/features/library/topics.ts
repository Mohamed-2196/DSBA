// Past questions by study-guide topic: each tag of a chapter names up to three of the topics its study guide lists for
// that chapter (ModuleDetail's chapters list them in the guide's order). Pure helpers for the chapter's list, the
// practise page and the paper page.
import type { PaperQuestion, StudyTopic } from '../../api/types';

/** The group of a chapter's questions that name no topic. Topic ids are lower case letters, digits and hyphens, so
 *  this one never meets a real topic. */
export const OTHER_TOPIC = '_other';
export const OTHER_TITLE = 'Other';

export interface TopicGroup {
  id: string;
  title: string;
  questions: PaperQuestion[];
}

/**
 * A chapter's questions grouped by topic: the study guide's topics in its order (those with questions), then any
 * topic the guide no longer lists, in the order they come, then "Other" for the questions without a topic. A question
 * on two topics is in both groups; each group keeps the list's order.
 */
export function topicGroups(list: readonly PaperQuestion[], guide: readonly StudyTopic[] = []): TopicGroup[] {
  const groups = new Map<string, TopicGroup>(guide.map((t) => [t.id, { id: t.id, title: t.title, questions: [] }]));
  const other: TopicGroup = { id: OTHER_TOPIC, title: OTHER_TITLE, questions: [] };
  for (const q of list) {
    if (!q.topics.length) other.questions.push(q);
    for (const t of q.topics) {
      const group = groups.get(t.id) ?? { id: t.id, title: t.title, questions: [] };
      group.questions.push(q);
      groups.set(t.id, group);
    }
  }
  return [...groups.values(), other].filter((g) => g.questions.length > 0);
}

/** Whether any of these questions names a topic: without one, a chapter's list stays one list. */
export function hasTopics(list: readonly PaperQuestion[]): boolean {
  return list.some((q) => q.topics.length > 0);
}

/** The questions of one topic (OTHER_TOPIC: those without one); every question with `topic` null. */
export function inTopic(list: readonly PaperQuestion[], topic: string | null): PaperQuestion[] {
  if (topic === null) return [...list];
  if (topic === OTHER_TOPIC) return list.filter((q) => !q.topics.length);
  return list.filter((q) => q.topics.some((t) => t.id === topic));
}

/** A topic's title among the groups or the guide's topics; null when it is neither. */
export function topicTitle(
  topic: string | null,
  groups: readonly TopicGroup[],
  guide: readonly StudyTopic[] = [],
): string | null {
  if (topic === null) return null;
  if (topic === OTHER_TOPIC) return OTHER_TITLE;
  return groups.find((g) => g.id === topic)?.title ?? guide.find((t) => t.id === topic)?.title ?? null;
}

/** 'Elasticity › Price elasticity of demand, Cross elasticity'; the chapter alone without topics. */
export function questionAbout(q: Pick<PaperQuestion, 'chapterTitle' | 'topics'>): string {
  return q.topics.length ? `${q.chapterTitle} › ${q.topics.map((t) => t.title).join(', ')}` : q.chapterTitle;
}

/** A topic from an address's ?topic=: a well-formed id or OTHER_TOPIC, else null (every question). */
export function topicParam(raw: string | null): string | null {
  if (!raw) return null;
  return raw === OTHER_TOPIC || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) ? raw : null;
}
