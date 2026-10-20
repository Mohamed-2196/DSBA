// The API's 422 for a document edited whole, as its editor shows it: each field's message by the field's path under
// the document ('resultsDay.steps.2.links.0.to'), and the messages about the save, the document or a whole part of it.

export interface DocErrors {
  /** by path under the document */
  fields: Record<string, string>;
  /** about the save, the document as a whole, or a whole part or list of it */
  general: string[];
}

/** What a document's editor tells docErrors about the document's shape. */
export interface DocShape {
  /** the parts and lists whose own messages are about all of them ('resultsDay.steps': "Add at least one step"), shown
   *  above the editor; every other path is a field's */
  wholes?: readonly string[];
  /** the places that hold one of several shapes, with * for any one name or number: '*.steps.*.links.*' (a link to a
   *  site or to a page). The API names the shape after the place ('….links.0.page.to'); a field's path leaves it out
   *  ('….links.0.to'). */
  unions?: readonly string[];
}

const matches = (segments: readonly string[], pattern: readonly string[]): boolean =>
  segments.length > pattern.length && pattern.every((p, i) => p === '*' || p === segments[i]);

/** The path without the shapes' names the API puts in it. */
function withoutShapes(path: string, unions: readonly string[]): string {
  let segments = path.split('.');
  for (const union of unions) {
    const pattern = union.split('.');
    if (matches(segments, pattern)) segments = segments.filter((_, i) => i !== pattern.length);
  }
  return segments.join('.');
}

/** `fields` is the API's ApiError.fields for a save: 'data.links.myclass.url', 'data.tagline', 'data', 'version'. */
export function docErrors(fields: Record<string, string>, { wholes = [], unions = [] }: DocShape = {}): DocErrors {
  const out: DocErrors = { fields: {}, general: [] };
  for (const [key, message] of Object.entries(fields)) {
    const inDoc = key === 'data' || key.startsWith('data.');
    const path = inDoc ? withoutShapes(key.slice('data.'.length), unions) : '';
    if (path === '' || wholes.includes(path)) {
      if (!out.general.includes(message)) out.general.push(message);
    } else {
      out.fields[path] = message;
    }
  }
  return out;
}

/** Whether any field error lies under `prefix` (an item of a list, or a whole part). */
export const hasErrorUnder = (fields: Record<string, string>, prefix: string): boolean =>
  Object.keys(fields).some((k) => k === prefix || k.startsWith(`${prefix}.`));
