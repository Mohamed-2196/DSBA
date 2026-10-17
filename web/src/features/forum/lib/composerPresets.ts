// "Start a thread" links can say what the thread is about: /forum/new?category=year-1&module=MT1186&title=…
// (the module page's "Ask about this module", "Ask it as a thread" after a search). This turns such a link into the
// form the composer opens with. A plain function: NewThreadPage gives it the catalogue lookups.
import type { ModuleSummary } from '../../../api/types';
import type { CategoryId, ForumCategory } from '../types';
import type { ThreadForm } from './threadDraft';
import { TITLE_MAX } from './threadForm';

export interface PresetLookups {
  getModule: (id: string) => Pick<ModuleSummary, 'id' | 'year'> | null;
  getModuleByUnitCode: (code: string) => Pick<ModuleSummary, 'id' | 'year'> | null;
  /** a category that is offered (not retired), or null */
  getCategory: (id: string) => Pick<ForumCategory, 'id' | 'year'> | null;
  categoryForYear: (year: number | null | undefined) => CategoryId | null;
  /** where a thread goes when no year fits it */
  defaultCategory: CategoryId;
}

/**
 * The form a link asks for, or null when it asks for nothing (then a stored draft may come back instead).
 *   ?module    a module id, or its unit code in any case (?module=mt1186)
 *   ?category  where to post it; a year that disagrees with the module follows the module (the more specific
 *              choice). Without one: the module's year, then the person's own year, then the default category.
 *   ?title     the title, cut to the composer's limit
 */
export function composerPresets(params: URLSearchParams, find: PresetLookups, ownYear: number | null | undefined): ThreadForm | null {
  const moduleParam = params.get('module')?.trim() ?? '';
  const mod = moduleParam ? (find.getModule(moduleParam) ?? find.getModuleByUnitCode(moduleParam.toUpperCase())) : null;
  const categoryParam = params.get('category');
  const cat = categoryParam ? find.getCategory(categoryParam) : null;
  const title = (params.get('title') ?? '').slice(0, TITLE_MAX);
  if (!cat && !mod && !title.trim()) return null;
  const agrees = cat && !(cat.year && mod && cat.year !== mod.year);
  const category: CategoryId = agrees ? cat.id : (find.categoryForYear(mod?.year ?? ownYear) ?? find.defaultCategory);
  return { title, body: '', category, moduleId: mod?.id ?? '', tags: [] };
}
