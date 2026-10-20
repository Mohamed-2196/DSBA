import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** A page's lazy component, whose code can also be fetched before it first renders (`preload`). */
export type LazyPage = LazyExoticComponent<ComponentType> & { preload: () => Promise<unknown> };

/** React.lazy over a page's import, with the same download shared by `preload` and the first render. */
export function lazyPage(load: () => Promise<{ default: ComponentType }>): LazyPage {
  let loading: Promise<{ default: ComponentType }> | undefined;
  const once = () =>
    (loading ??= load().catch((e: unknown) => {
      loading = undefined; // a failed download is tried again next time
      throw e;
    }));
  return Object.assign(lazy(once), { preload: once });
}
