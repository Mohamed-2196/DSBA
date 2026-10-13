// A live section (exams, hot threads, new files) reads another part of the hub. While that part is switched off for
// the reader, the section shows only its stored text.
import type { Feature } from '../../../auth';
import type { SectionKind } from '../types';

const LIVE_FEATURE: Record<SectionKind, Feature> = { deadlines: 'calendar', forum: 'forum', library: 'library' };

export function liveSectionOn(kind: SectionKind, isOn: (feature: Feature) => boolean): boolean {
  return isOn(LIVE_FEATURE[kind]);
}
