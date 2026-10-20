// Every stylesheet loads into one page and stays loaded, so two stylesheets that style the same class fight over
// it once both have loaded (the module page's rows once broke /modules' list that way, but only after a module page
// had been opened). A class is styled in one stylesheet, unless it is one component's styles split on purpose.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

/** Classes one component styles from two files, by design. */
const SHARED: Record<string, readonly string[]> = {
  'cal-row': ['features/calendar/CalendarPage.css', 'features/calendar/calendar-shared.css'],
  'forum-hot__title': ['features/forum/HotThreads.css', 'features/forum/components/forum.css'],
  'forum-modthreads': ['features/forum/HotThreads.css', 'features/forum/components/forum.css'],
  'forum-page': ['features/forum/ForumPage.css', 'features/forum/components/forum.css'],
  'forum-thread__title': ['features/forum/ThreadPage.css', 'features/forum/components/forum.css'],
  'nb-print': ['features/notes/Notebook.css', 'features/notes/print/print.css'],
  'nb-print-sources': ['features/notes/Notebook.css', 'features/notes/print/print.css'],
  'shell-profile__meta': ['shell/ProfileMenu.css', 'shell/Sidebar.css'],
  'shell-profile__name': ['shell/ProfileMenu.css', 'shell/Sidebar.css'],
};

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

/** The classes a stylesheet's rules start with (`.mod-row {`, `.mod-row,`), comments left out. */
function ruleClasses(css: string): Set<string> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...bare.matchAll(/^\s*\.([a-zA-Z][\w-]*)\s*[,{]/gm)].map((m) => m[1]));
}

describe('ruleClasses', () => {
  it('reads the classes rules start with', () => {
    const css = '/* .gone { } */\n.a {\n}\n.b,\n.c .d {\n}\n  .e:hover {\n}\n@media (x) {\n  .f {\n  }\n}';
    expect([...ruleClasses(css)]).toEqual(['a', 'b', 'f']);
  });
});

describe('stylesheets', () => {
  it('style each class in one file', () => {
    const where = new Map<string, string[]>();
    for (const path of stylesheets(SRC)) {
      const file = relative(SRC, path);
      for (const cls of ruleClasses(readFileSync(path, 'utf8'))) where.set(cls, [...(where.get(cls) ?? []), file]);
    }
    const twice = Object.fromEntries(
      [...where].filter(([, files]) => files.length > 1).map(([cls, files]) => [cls, [...files].sort()]),
    );
    expect(twice).toEqual(SHARED);
  });
});
