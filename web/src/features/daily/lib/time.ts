// Clocks for the Daily: the time to the next set, and how long a play took.

/** Time left until `targetIso` as a clock, as DSBA Daily shows it: '11:50:00', '00:00:42'; '00:00:00' once it passes. */
export function formatTimeLeft(targetIso: string, now: number = Date.now()): string {
  const total = Math.ceil(Math.max(0, new Date(targetIso).getTime() - now) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

/** A play's length: '0:42', '12:05', '1:02:03'. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}
