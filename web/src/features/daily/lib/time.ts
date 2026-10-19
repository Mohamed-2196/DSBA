// Clocks for the Daily: the time to the next set, and how long a play took.

/** Time left until `targetIso` in hours and minutes ('11 h 50 min', '50 min'); at least '1 min' until it passes. */
export function formatTimeLeft(targetIso: string, now: number = Date.now()): string {
  const minutes = Math.ceil(Math.max(0, new Date(targetIso).getTime() - now) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${Math.max(rest, 1)} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** A play's length: '0:42', '12:05', '1:02:03'. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}
