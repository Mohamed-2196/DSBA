// Public API of the modules feature (agent A). Signatures are a contract — do not change them.
import { getModule } from '../../data/modules.js';
import { computeModuleProgress, readProgress } from './progress.js';

/**
 * Card(s) for Home: the 1–3 most recent in-progress lessons with module progress, or an empty
 * state that sends the student to /modules. Reactive to progress changes in this tab and others.
 */
export { ContinueLearning } from './ContinueLearning.jsx';

/**
 * Lesson progress for a module from this browser's local progress store.
 * @param {string} moduleId  v2 id (a v1 code also works)
 * @returns {{ watched: number, total: number, pct: number }}  pct is 0–100 (rounded); unknown module → zeros
 */
export function getModuleProgress(moduleId) {
  const m = getModule(moduleId);
  if (!m) return { watched: 0, total: 0, pct: 0 };
  return computeModuleProgress(readProgress(), m);
}
