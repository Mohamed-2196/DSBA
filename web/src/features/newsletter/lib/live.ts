// A live section (exams, hot threads, new files, requests done) reads another part of the hub. While that part is
// switched off for the reader, the section shows only its stored text.
import type { Feature } from '../../../auth';
import type { SectionKind } from '../types';

const LIVE_FEATURES: Record<SectionKind, readonly Feature[]> = {
  deadlines: ['calendar'],
  forum: ['forum'],
  library: ['library'],
  requests: ['requests', 'requests.done'],
};

export function liveSectionOn(kind: SectionKind, isOn: (feature: Feature) => boolean): boolean {
  return LIVE_FEATURES[kind].every(isOn);
}
