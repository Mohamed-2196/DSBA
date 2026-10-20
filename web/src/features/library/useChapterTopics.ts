// A chapter's study-guide topics, from the module's detail (GET /modules/{id}, one cache entry with the Lessons tab).
import { useQuery } from '@tanstack/react-query';
import type { StudyTopic } from '../../api/types';
import { moduleDetailQuery } from '../modules/public';

const NONE: readonly StudyTopic[] = [];

/** The chapter's topics in the guide's order; none until the module loads, or when the guide lists none. */
export function useChapterTopics(moduleId: string, chapterId: string): readonly StudyTopic[] {
  const module = useQuery({ ...moduleDetailQuery(moduleId), enabled: !!moduleId });
  return module.data?.chapters.find((c) => c.id === chapterId)?.topics ?? NONE;
}
