// Ids for the categories and tags made in Manage → Forum. An id goes in links (/forum?cohort=year-2), so it is made
// from the label when the item is first saved and never changes after; the API checks the same pattern.

const MAX = 32;

/** 'Study groups' → 'study-groups'; letters and digits only, at most 32 characters, never one of `taken`. */
export function idFromLabel(label: string, taken: Iterable<string>, fallback = 'item'): string {
  const used = new Set(taken);
  const base =
    label
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX)
      .replace(/-+$/, '') || fallback;
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const end = `-${n}`;
    const id = `${base.slice(0, MAX - end.length).replace(/-+$/, '')}${end}`;
    if (!used.has(id)) return id;
  }
}

/** The items as saved: those not saved before get an id made from their label (their draft id was a stand-in), never
 *  one of `reserved` (a category's id can't be 'all': ?cohort=all is the All tab). */
export function withSavedIds<T extends { id: string }>(items: readonly T[], savedIds: ReadonlySet<string>, labelOf: (item: T) => string, fallback: string, reserved: readonly string[] = []): T[] {
  const taken = new Set([...reserved, ...items.filter((i) => savedIds.has(i.id)).map((i) => i.id)]);
  return items.map((item) => {
    if (savedIds.has(item.id)) return item;
    const id = idFromLabel(labelOf(item), taken, fallback);
    taken.add(id);
    return { ...item, id };
  });
}
