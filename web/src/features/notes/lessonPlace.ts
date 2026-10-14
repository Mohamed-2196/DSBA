// Where a note's lesson is in its module now ({ c, v }), from the module's lessons (one cached query per module).
import { useQuery } from '@tanstack/react-query';
import { findLesson, moduleDetailQuery } from '../modules/public';

export function useLessonPlace(moduleId: string | null, lessonId: string | null): { c: number; v: number } | null {
  const detail = useQuery({ ...moduleDetailQuery(moduleId ?? ''), enabled: !!moduleId && !!lessonId });
  return lessonId ? findLesson(detail.data, lessonId) : null;
}
