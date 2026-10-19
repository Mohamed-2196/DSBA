// What the document editors share besides their components (docEditor/kit.tsx): ids for new items.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Eight random lowercase letters and digits. */
function randomPart(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * An id for a new item: lowercase letters and digits, never shown, never changed. Its end is random, so a new item
 * never takes the id of one removed before: students keep marks and ticks by these ids (the grades calculator's
 * subjects, the guides' steps), and a new item must not show an old one's.
 */
export function newItemId(prefix: string, taken: Iterable<string>, random: () => string = randomPart): string {
  const used = new Set(taken);
  for (;;) {
    const id = `${prefix}-${random()}`;
    if (!used.has(id)) return id;
  }
}
