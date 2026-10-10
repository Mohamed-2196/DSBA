import { useModules } from '../../../state/modules';
import type { CategoryId } from '../types';
import { categoryForYear, useTaxonomy } from './taxonomy';

export interface Placement {
  category: CategoryId;
  /** '' = no specific module */
  moduleId: string;
}

/**
 * Keep the category and the module consistent: a module from another year moves a year-category thread to that
 * year, and picking a year category that disagrees with the module clears the module.
 */
export function usePlacementRules() {
  const { getModule } = useModules();
  const { getCategory } = useTaxonomy();
  return {
    withModule(p: Placement, moduleId: string): Placement {
      const next = getModule(moduleId);
      const cat = getCategory(p.category);
      if (next && cat?.year && cat.year !== next.year) return { moduleId, category: categoryForYear(next.year) ?? p.category };
      return { ...p, moduleId };
    },
    withCategory(p: Placement, category: CategoryId): Placement {
      const cat = getCategory(category);
      const mod = getModule(p.moduleId);
      if (cat?.year && mod && mod.year !== cat.year) return { category, moduleId: '' };
      return { ...p, category };
    },
  };
}
