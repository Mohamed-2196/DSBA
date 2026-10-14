// What her AI can see, as the chips above the composer name it. Pure.
import type { ModuleSummary } from '../../api/types';

const PAGES: Record<string, string> = {
  '': 'Home',
  modules: 'Modules',
  library: 'Library',
  newsletter: 'Newsletter',
  forum: 'Forum',
  career: 'Career Navigator',
  calendar: 'Calendar',
  requests: 'Requests',
  grades: 'Grades',
  notes: 'Notes',
  account: 'Your account',
  manage: 'Manage',
  board: 'Study board',
  'results-day': 'Results day',
  'start-here': 'Start here',
  about: 'About',
};

const ONE_OF: Record<string, string> = { library: 'A library file', newsletter: 'A newsletter issue', forum: 'A forum thread', requests: 'A request', notes: 'A note' };

/** The page the student is on, in a few words: "Lesson in ST2133", "EC1002 Economics", "Calendar". */
export function pageLabel(pathname: string, modules: readonly ModuleSummary[]): string {
  const [first = '', second, third] = pathname.split('/').filter(Boolean);
  if (first === 'modules' && second) {
    const module = modules.find((m) => m.id === decodeURIComponent(second));
    const code = module ? module.unitCode ?? module.shortName : null;
    if (third === 'lessons') return code ? `Lesson in ${code}` : 'A lesson';
    return module ? [module.unitCode, module.shortName].filter(Boolean).join(' ') : 'A module';
  }
  if (second && first !== 'career') return ONE_OF[first] ?? 'This page';
  if (first === 'career' && second === 'electives') return 'Choosing your electives';
  return PAGES[first] ?? 'This page';
}
