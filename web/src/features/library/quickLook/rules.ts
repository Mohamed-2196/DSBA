// Quick Look's rules as plain functions (tested in rules.test.ts): whether Space belongs to what has focus, and
// which file the arrow keys move to.

/** What has focus, as Space cares about it. */
export interface Focused {
  tag: string;
  role?: string | null;
  editable?: boolean;
}

const OWN_TAGS = new Set(['input', 'textarea', 'select', 'button', 'summary']);
const OWN_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'button', 'checkbox', 'switch', 'option']);

/** Whether Space types or chooses something here: fields, editable text, and the controls Space presses (buttons,
 *  checkboxes, switches). Quick Look leaves Space to them. */
export function ownsSpace(f: Focused): boolean {
  return !!f.editable || OWN_TAGS.has(f.tag.toLowerCase()) || OWN_ROLES.has(f.role?.toLowerCase() ?? '');
}

/** The file `delta` places from the one with `id` (no wrapping round): null past either end, or when it isn't there. */
export function stepFrom<T extends { id: string }>(items: readonly T[], id: string, delta: number): T | null {
  const i = items.findIndex((it) => it.id === id);
  if (i < 0) return null;
  return items[i + delta] ?? null;
}

/** "3 of 20" for the file with `id`; null when it isn't in the list. */
export function placeOf(items: readonly { id: string }[], id: string): string | null {
  const i = items.findIndex((it) => it.id === id);
  return i < 0 ? null : `${i + 1} of ${items.length}`;
}

/** How many pages Quick Look draws: the first few, enough to tell one file from another. */
export const QUICK_PAGES = 3;

/** Marks a file's element in a list (its id), the link that opens it, and its Preview button. */
export const QL_FILE = 'data-ql-id';
export const QL_LINK = 'data-ql-link';
export const QL_BUTTON = 'data-ql-button';

/** What has focus, read from the page. */
export function focusedOf(el: Element): Focused {
  return {
    tag: el.tagName,
    role: el.getAttribute('role'),
    editable: el instanceof HTMLElement && el.isContentEditable,
  };
}
