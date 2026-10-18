// Clocks for the Daily: the countdown to the next set, and how long a play took.

/** Time left until `targetIso` as hh:mm:ss ('02:30:15'); '00:00:00' once it has passed. */
export function formatCountdown(targetIso: string, now: number = Date.now()): string {
  const diff = Math.max(0, new Date(targetIso).getTime() - now);
  const total = Math.floor(diff / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/** A play's length: '0:42', '12:05', '1:02:03'. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}
