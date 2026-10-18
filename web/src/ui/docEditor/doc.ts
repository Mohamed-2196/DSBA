// What the document editors share besides their components (docEditor/kit.tsx): ids for new items.

/** An id for a new item: lowercase letters and digits, never shown, never changed. */
export function newItemId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = used.size + 1; ; n += 1) {
    const id = `${prefix}-${n}`;
    if (!used.has(id)) return id;
  }
}
