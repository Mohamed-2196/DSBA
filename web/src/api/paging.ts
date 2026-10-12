// Offset paging, as every list endpoint answers it: { items, total, offset, limit }.

/** The part of a list page that paging needs. */
export interface OffsetPage {
  offset: number;
  total: number;
  items: readonly unknown[];
}

/**
 * The offset of the page after `page`, or undefined when there is none: pass it as `getNextPageParam` to
 * `useInfiniteQuery` (with `initialPageParam: 0`). An empty page ends the list even when `total` says there is more,
 * so a list that shrank while someone paged through it can't ask for the same page forever.
 */
export function nextOffset(page: OffsetPage): number | undefined {
  const next = page.offset + page.items.length;
  return page.items.length > 0 && next < page.total ? next : undefined;
}

/** How many items the list still holds beyond the pages loaded so far (0 when everything is loaded). */
export function remainingCount(pages: readonly OffsetPage[] | undefined): number {
  if (!pages?.length) return 0;
  const last = pages[pages.length - 1];
  return Math.max(0, last.total - (last.offset + last.items.length));
}
