// Small text helpers for search: the words worth marking in a result, and the query for "similar threads".

const STOP = new Set(
  'a an and are as at be but by can could do does for from get got has have how i if in into is it its me my of on or our should so than that the their them then there these this to was we were what when where which who why will with would you your any anyone someone just about vs'.split(
    ' ',
  ),
);

/** The distinct words of a query, lower-cased, without filler words. Arabic and other scripts are kept. */
export function tokenize(query: string | null | undefined): string[] {
  // \p{M}: combining marks stay inside a word (Arabic vowel marks, accents).
  const words = String(query ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
  return [...new Set(words)];
}

/** Words of `query` worth marking in a title or excerpt. */
export function highlightTerms(query: string | null | undefined): string[] {
  return tokenize(query).filter((w) => w.length > 1);
}

/**
 * The search for threads like a title being typed: its meaningful words, longest first, at most six, as a
 * web-search style "or" query (quoted words make the API read the query with websearch_to_tsquery, where "or" is an
 * operator; plain words would all have to match). Empty when the title has nothing to search for.
 */
export function similarQuery(title: string): string {
  const words = tokenize(title)
    .filter((w) => w.length > 2 || /\d/.test(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, 6);
  return words.map((w) => `"${w}"`).join(' or ');
}

/**
 * The threads most like a title, best first: words of the title that start a word of the other title count double,
 * words found in its excerpt count once. Threads with no word in common with the title are left out.
 */
export function rankSimilar<T extends { title: string; excerpt: string; voteCount: number }>(threads: T[], title: string, n = 4): T[] {
  const terms = tokenize(title).filter((w) => w.length > 2 || /\d/.test(w));
  if (!terms.length) return [];
  const words = (text: string) => tokenize(text);
  const scored = threads.map((t) => {
    const inTitle = words(t.title);
    const inExcerpt = words(t.excerpt);
    let score = 0;
    let titleHits = 0;
    for (const term of terms) {
      if (inTitle.some((w) => w.startsWith(term))) {
        score += 2;
        titleHits += 1;
      } else if (inExcerpt.some((w) => w.startsWith(term))) score += 1;
    }
    return { t, score, titleHits };
  });
  return scored
    .filter((x) => x.titleHits > 0 && x.score >= Math.min(2, terms.length))
    .sort((a, b) => b.score - a.score || b.t.voteCount - a.t.voteCount)
    .slice(0, n)
    .map((x) => x.t);
}
