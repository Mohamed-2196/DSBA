// Small helpers for feature code. (Component files only export components.)
export { cx } from './internal';

/** 'Sayed Ali M.' → 'SA', 'Mohamed Alnooh' → 'MA', 'Dr. Sayed Hasan Kadhem' → 'SH'. */
export function initials(name = '') {
  const words = String(name).replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase() || '?';
}

/** '⌘' on Apple platforms, 'Ctrl' elsewhere. */
export function modKeyLabel() {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '') || /Macintosh|Mac OS X|iPhone|iPad/.test(navigator.userAgent || '') ? '⌘' : 'Ctrl';
}

/**
 * Relative time from Date.now() (the film freezes the clock, so this stays deterministic).
 * '2h ago', '3d ago', 'just now', or a short date for > 30 days.
 */
export function timeAgo(input, now = Date.now()) {
  const t = typeof input === 'number' ? input : new Date(input).getTime();
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** '6 Oct 2026' (en-GB) from a Date / ISO / 'YYYY-MM-DD'. Date-only strings are read as local days. */
export function formatDate(input, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  let d = input;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, day] = input.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else if (!(input instanceof Date)) d = new Date(input);
  return d.toLocaleDateString('en-GB', opts);
}
