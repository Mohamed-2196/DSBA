// The tag chips of the list's filter bar. A plain function (ForumPage gives it the counts and the threads on screen).
import type { ForumTag } from '../types';

export interface TagChip extends ForumTag {
  /** how many threads have it (in the current category); undefined while the counts haven't arrived */
  count?: number;
}

export interface TagChipsInput {
  /** tag id -> threads, for the current category (GET /forum/stats byTag or tagsByCategory); undefined until loaded */
  counts: Record<string, number> | undefined;
  /** the tags of the threads on screen: they stand in, uncounted, until the counts arrive */
  shownTags: readonly (readonly string[])[];
  /** every tag the forum knows, in the API's order */
  allTags: readonly ForumTag[];
  /** the tag the list is filtered by ('' for none): it always has a chip, so it can be turned off */
  selected: string;
  max?: number;
}

/** The most used tags (ties keep the API's order), at most `max`, plus the selected one; tags nobody uses are left out. */
export function tagChips({ counts, shownTags, allTags, selected, max = 6 }: TagChipsInput): TagChip[] {
  const n = new Map<string, number>();
  if (counts) for (const [id, c] of Object.entries(counts)) n.set(id, c);
  else for (const tags of shownTags) for (const id of tags) n.set(id, (n.get(id) ?? 0) + 1);
  const chip = (t: ForumTag): TagChip => ({ ...t, count: counts ? (n.get(t.id) ?? 0) : undefined });
  const chips = allTags
    .filter((t) => (n.get(t.id) ?? 0) > 0)
    .sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0))
    .slice(0, max)
    .map(chip);
  const picked = selected ? allTags.find((t) => t.id === selected) : undefined;
  if (picked && !chips.some((t) => t.id === picked.id)) chips.push(chip(picked));
  return chips;
}
