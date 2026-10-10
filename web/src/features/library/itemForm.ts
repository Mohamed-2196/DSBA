// The details form shared by "Upload a file" and "Edit details": values, checks, and request bodies.
import type { LibraryItemCreate, LibraryItemUpdate, ModuleSummary } from '../../api/types';
import { EXAM_KINDS, type LibraryKind } from './kinds';
import type { CohortYear, LibraryItem } from './types';

export interface ItemFormValues {
  title: string;
  kind: LibraryKind;
  /** '' = not chosen yet, 'none' = not about one module, else a module id. */
  module: string;
  /** Only used when module is 'none'. */
  year: '' | '1' | '2' | '3';
  examYear: string;
  zone: '' | 'A' | 'B';
  authorName: string;
  description: string;
}

export type ItemFormErrors = Partial<Record<keyof ItemFormValues, string>>;

export const NO_MODULE = 'none';

export function emptyValues({ moduleId, year }: { moduleId?: string | null; year?: CohortYear | null } = {}): ItemFormValues {
  return {
    title: '',
    kind: 'notes',
    module: moduleId ?? '',
    year: year ? (String(year) as ItemFormValues['year']) : '',
    examYear: '',
    zone: '',
    authorName: '',
    description: '',
  };
}

export function valuesFromItem(item: LibraryItem): ItemFormValues {
  return {
    title: item.title,
    kind: item.kind,
    module: item.moduleId ?? NO_MODULE,
    year: item.year ? (String(item.year) as ItemFormValues['year']) : '',
    examYear: item.examYear ? String(item.examYear) : '',
    zone: item.zone === 'A' || item.zone === 'B' ? item.zone : '',
    authorName: item.authorName ?? '',
    description: item.description ?? '',
  };
}

const THIS_YEAR = new Date().getFullYear();

/** Field errors (empty when the form can be sent). Mirrors the API's limits. */
export function checkValues(v: ItemFormValues): ItemFormErrors {
  const errors: ItemFormErrors = {};
  const title = v.title.trim();
  if (title.length < 3) errors.title = 'Give it a title of at least 3 characters.';
  else if (title.length > 200) errors.title = 'Keep the title under 200 characters.';
  if (!v.module) errors.module = 'Choose the module it is for, or “Not about one module”.';
  if (EXAM_KINDS.has(v.kind) && v.examYear.trim()) {
    const n = Number(v.examYear);
    if (!Number.isInteger(n) || n < 1990 || n > THIS_YEAR + 1) errors.examYear = `Enter a year between 1990 and ${THIS_YEAR + 1}.`;
  }
  if (v.authorName.trim().length > 120) errors.authorName = 'Keep the name under 120 characters.';
  if (v.description.trim().length > 2000) errors.description = 'Keep the description under 2,000 characters.';
  return errors;
}

/** The fields the API names in its validation errors, mapped to ours. */
export function errorsFromApi(fields: Record<string, string>): ItemFormErrors {
  const map: Record<string, keyof ItemFormValues> = {
    title: 'title',
    kind: 'kind',
    moduleId: 'module',
    module_id: 'module',
    year: 'year',
    examYear: 'examYear',
    exam_year: 'examYear',
    zone: 'zone',
    authorName: 'authorName',
    author_name: 'authorName',
    description: 'description',
  };
  const out: ItemFormErrors = {};
  for (const [k, msg] of Object.entries(fields)) {
    const key = map[k.split('.').pop() ?? k];
    if (key) out[key] = msg;
  }
  return out;
}

function details(v: ItemFormValues, getModule: (id: string) => ModuleSummary | null) {
  const m = v.module && v.module !== NO_MODULE ? getModule(v.module) : null;
  const exam = EXAM_KINDS.has(v.kind);
  return {
    title: v.title.trim(),
    kind: v.kind,
    moduleId: m ? m.id : null,
    year: m ? m.year : v.year ? (Number(v.year) as CohortYear) : null,
    description: v.description.trim() || null,
    examYear: exam && v.examYear.trim() ? Number(v.examYear) : null,
    zone: exam && v.zone ? v.zone : null,
    authorName: v.authorName.trim() || null,
  };
}

export function toCreateBody(uploadId: string, v: ItemFormValues, getModule: (id: string) => ModuleSummary | null): LibraryItemCreate {
  return { uploadId, ...details(v, getModule) };
}

/** Every field is sent: an empty one is cleared. */
export function toUpdateBody(v: ItemFormValues, getModule: (id: string) => ModuleSummary | null): LibraryItemUpdate {
  return details(v, getModule);
}
