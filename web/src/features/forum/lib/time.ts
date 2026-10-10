// Times the API doesn't give: "New" marks and the like, from ISO timestamps.

const HOUR = 3_600_000;

/** Threads younger than this get the highlighter "New" mark. */
export const NEW_FOR_MS = 2 * HOUR;

export function msOf(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function isNew(createdAt: string, now: number = Date.now()): boolean {
  const t = msOf(createdAt);
  return t > 0 && now - t < NEW_FOR_MS;
}
