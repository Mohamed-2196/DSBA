// `test` with a page per persona, each in its own browser context (its own cookies and storage):
//   sara   Year 2, signed up with her phone (setup project)        ali    Year 1, signed up with his email
//   rep    a student rep (dev-login)                                admin  an admin (dev-login)
//   guest  nobody signed in, browsing Year 2
// Mini Noora is hidden on every page (her hint covers the bottom-right corner); see support.prepareContext.
import { test as base, type Browser, type Page } from '@playwright/test';
import { env, personaContext, prepareContext, readRun, type Persona, type RunInfo } from './support';

interface Personas {
  sara: Page;
  ali: Page;
  rep: Page;
  admin: Page;
  guest: Page;
  run: RunInfo;
}

// The second argument of a fixture is the function that hands the value to the test (Playwright calls it `use`).
const persona =
  (who: Persona) =>
  async ({ browser }: { browser: Browser }, provide: (p: Page) => Promise<void>) => {
    const ctx = await personaContext(browser, who);
    const page = await ctx.newPage();
    await provide(page);
    await ctx.close();
  };

export const test = base.extend<Personas>({
  sara: persona('sara'),
  ali: persona('ali'),
  rep: persona('rep'),
  admin: persona('admin'),
  guest: async ({ browser }, provide) => {
    const ctx = await browser.newContext({ baseURL: env.baseURL, acceptDownloads: true });
    await prepareContext(ctx);
    const page = await ctx.newPage();
    await provide(page);
    await ctx.close();
  },
  // eslint-disable-next-line no-empty-pattern
  run: async ({}, provide) => {
    await provide(readRun());
  },
});

export { expect } from '@playwright/test';
