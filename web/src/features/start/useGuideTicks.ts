import { useMemo } from 'react';
import { RESULTS_DAY, START_HERE } from '../../data/guides';
import { useLocalStorage } from '../../state';
import { doneSteps, toggleStep } from './startHere';

export interface GuideTicks {
  done: Set<string>;
  total: number;
  toggle: (id: string) => void;
}

/**
 * A guide's ticks, kept in this browser under `key` as a JSON array of step ids, e.g. ["portal","modules"].
 * Not personal: each guide is the same for everyone.
 */
export function useGuideTicks(key: string, stepIds: readonly string[]): GuideTicks {
  const [stored, setStored] = useLocalStorage<unknown>(key, []);
  const done = useMemo(() => doneSteps(stored, stepIds), [stored, stepIds]);
  return { done, total: stepIds.length, toggle: (id: string) => setStored((prev: unknown) => toggleStep(prev, id)) };
}

const START_IDS = START_HERE.steps.map((s) => s.id);
const RESULTS_IDS = RESULTS_DAY.steps.map((s) => s.id);

export const useStartTicks = (): GuideTicks => useGuideTicks('hub.start.checklist', START_IDS);
export const useResultsTicks = (): GuideTicks => useGuideTicks('hub.results.checklist', RESULTS_IDS);
