import { useMemo } from 'react';
import type { GuideStep } from '../../api/types';
import { useLocalStorage } from '../../state';
import { doneSteps, toggleStep } from './guides';

export interface GuideTicks {
  done: Set<string>;
  total: number;
  toggle: (id: string) => void;
}

/**
 * A guide's ticks, kept in this browser under `key` as a JSON array of step ids, e.g. ["portal","modules"].
 * Not personal: each guide is the same for everyone. A step that was removed simply stops counting.
 */
export function useGuideTicks(key: string, steps: readonly GuideStep[]): GuideTicks {
  const [stored, setStored] = useLocalStorage<unknown>(key, []);
  const ids = useMemo(() => steps.map((s) => s.id), [steps]);
  const done = useMemo(() => doneSteps(stored, ids), [stored, ids]);
  return { done, total: ids.length, toggle: (id: string) => setStored((prev: unknown) => toggleStep(prev, id)) };
}

export const useResultsTicks = (steps: readonly GuideStep[]): GuideTicks =>
  useGuideTicks('hub.results.checklist', steps);
