import { useMemo } from 'react';
import { START_HERE } from '../../data/guides';
import { useLocalStorage } from '../../state';
import { doneSteps, toggleStep } from './startHere';

/** Ticks: a JSON array of step ids, e.g. ["portal","modules"]. Not personal: the guide is the same for everyone. */
const TICKS_KEY = 'hub.start.checklist';
const STEP_IDS = START_HERE.steps.map((s) => s.id);

/** The ticked steps, how many there are, and a toggle. */
export function useStartTicks() {
  const [stored, setStored] = useLocalStorage<unknown>(TICKS_KEY, []);
  const done = useMemo(() => doneSteps(stored, STEP_IDS), [stored]);
  return { done, total: STEP_IDS.length, toggle: (id: string) => setStored((prev: unknown) => toggleStep(prev, id)) };
}

