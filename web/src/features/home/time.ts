// Home's own words about time. Days themselves (today in Bahrain, distances, formats) come from src/lib/dates.ts,
// the one home every area shares (code quality review CQ-5).

/** 'Good morning' | 'Good afternoon' | 'Good evening' for the hour on this device. */
export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** 'six' for 6 (≤ 10), digits above. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}
