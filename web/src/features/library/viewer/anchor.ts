// Where a past question starts on its page: the question's anchor (its first words, from the API) found in the
// page's text layer. Both sides compare letters and digits only, lower case (the API's question_anchors.key()):
// pdf.js and the server's reader space and punctuate the same words differently.

/** Letters and digits only, compatibility-normalised and lower case. */
export function anchorKey(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The letters and digits of the anchor matched: enough to find one place, few enough to survive a line break the
 *  two readers see differently further on. */
const MATCH_CHARS = 40;
const MIN_CHARS = 12;

/** The first and last text items (indexes into `items`) that hold the anchor's start, or null when the page doesn't
 *  have it. */
export function findAnchor(items: readonly string[], anchor: string): { first: number; last: number } | null {
  const wanted = anchorKey(anchor).slice(0, MATCH_CHARS);
  if (wanted.length < MIN_CHARS) return null;
  let text = '';
  const owner: number[] = []; // owner[i]: the item character i of `text` came from
  items.forEach((item, index) => {
    const key = anchorKey(item);
    text += key;
    for (let i = 0; i < key.length; i++) owner.push(index);
  });
  const at = text.indexOf(wanted);
  if (at < 0) return null;
  return { first: owner[at], last: owner[at + wanted.length - 1] };
}

export interface Box {
  /** fractions of the page, from its top-left corner */
  top: number;
  bottom: number;
}

/** The band across the page that holds these lines (fractions of its height), a little padded. */
export function bandOf(lines: readonly Box[], pad = 0.005): Box | null {
  if (!lines.length) return null;
  const top = Math.min(...lines.map((l) => l.top));
  const bottom = Math.max(...lines.map((l) => l.bottom));
  return { top: Math.max(0, top - pad), bottom: Math.min(1, bottom + pad) };
}
