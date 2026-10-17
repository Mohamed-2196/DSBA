// The API's 422 for a document edited whole, as its editor shows it: each field's message by the field's path under
// the document ('startHere.steps.2.links.0.to'), and the messages about the document or a whole part of it.

const LINK_KIND = /(links\.\d+)\.(?:web|site|page|date|install)(?=\.|$)/g;

export interface DocErrors {
  /** by path under the document */
  fields: Record<string, string>;
  /** about the document as a whole, or a whole part or list of it */
  general: string[];
}

/** `fields` is the API's ApiError.fields for a save: 'data.links.myclass.url', 'data', 'data.startHere'. A path
 *  through a link drops the link's kind, which the API puts in it ('links.0.page.to' is 'links.0.to'). */
export function docErrors(fields: Record<string, string>, lists: readonly string[] = []): DocErrors {
  const out: DocErrors = { fields: {}, general: [] };
  for (const [key, message] of Object.entries(fields)) {
    const path = key.replace(/^data\.?/, '').replace(LINK_KIND, '$1');
    const whole = path === '' || !path.includes('.') || lists.includes(path);
    if (whole) {
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
