// Times in a video, as students write them: "12:40", "1:02:05", or "41" (minutes).

/** The most a time stamp may be (api/app/schemas/suggestions.py TOPIC_MAX_SECONDS): within a day's video. */
export const MAX_SECONDS = 86_399;

/** "41:20", or "1:02:05" past the hour. */
export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** The seconds a written time means, or null when it isn't one ("12:40" → 760, "1:02:05" → 3725, "41" → 2460). */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (/^\d{1,3}$/.test(t)) {
    const minutes = Number(t);
    return minutes * 60 <= MAX_SECONDS ? minutes * 60 : null;
  }
  const parts = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(t);
  if (!parts) return null;
  const [, h, m, s] = parts;
  if (Number(s) > 59 || (h !== undefined && Number(m) > 59)) return null;
  const total = Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
  return total <= MAX_SECONDS ? total : null;
}

/** BigBlueButton's playback starts at `?t=1h2m5s`. */
export function playbackTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}h` : ''}${h || m ? `${m}m` : ''}${s % 60}s`;
}

/** "Covers: MLE, invariance and 2 more": the first topics of a lesson, for its row in the chapter list. */
export function coversLine(labels: readonly string[], shown = 2): string | null {
  if (!labels.length) return null;
  const first = labels.slice(0, shown).join(', ');
  const more = labels.length - shown;
  return more > 0 ? `Covers: ${first} and ${more} more` : `Covers: ${first}`;
}
