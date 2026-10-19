import type { ReactElement } from 'react';
import { MATE_LOADERS } from './art';
import type { MateName, MatePose } from './types';

export type AnyArt = Partial<Record<MatePose, ReactElement>>;
const loaded = new Map<MateName, AnyArt>();
const pending = new Map<MateName, Promise<AnyArt>>();

/** Loads a deskmate's drawings (each deskmate is a chunk of its own); call it early for one that shows above the fold. */
export function preloadDeskmate(mate: MateName): Promise<AnyArt> {
  const done = loaded.get(mate);
  if (done) return Promise.resolve(done);
  let p = pending.get(mate);
  if (!p) {
    p = MATE_LOADERS[mate]().then((m) => {
      const art = m.poses as AnyArt;
      loaded.set(mate, art);
      return art;
    });
    pending.set(mate, p);
    p.catch(() => pending.delete(mate));
  }
  return p;
}

/** A deskmate's drawings, when they have loaded. */
export function loadedDeskmate(mate: MateName): AnyArt | undefined {
  return loaded.get(mate);
}
