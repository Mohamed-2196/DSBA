import { Suspense, useLayoutEffect, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ModulesGate } from '../state/ModulesProvider';
import { Page as PageFrame, QueryError } from '../ui';
import { PageLoader } from './PageLoader';
import { RouteErrorBoundary } from './RouteErrorBoundary';

/** A page of the app (routes.tsx). */
export interface AppRoute {
  id: string;
  path: string;
  title: string | null;
  Page: LazyExoticComponent<ComponentType>;
  /** false: the page doesn't use the module catalogue, so it shows even when the catalogue can't be loaded */
  modules?: false;
  /** who may open it (the style guide is a tool for the team, not a page for students) */
  gate?: (page: ReactNode) => ReactNode;
}

/** A page that can't show because the module catalogue didn't load: the rest of the Hub still works. */
function CatalogueFailed({ retry, error, retrying }: { retry: () => void; error: unknown; retrying: boolean }) {
  return (
    <PageFrame>
      <QueryError error={error} title="This page didn’t load" onRetry={retry} retrying={retrying} />
    </PageFrame>
  );
}

/**
 * One page: its default tab title, the module catalogue it waits for, its lazy chunk (Suspense) and its own error
 * boundary, so one broken feature can't take down the rest of the app.
 */
export function RouteFrame({ route }: { route: AppRoute }) {
  const { pathname } = useLocation();
  const { id, title, Page, modules, gate } = route;
  // Default tab title. A layout effect, so a page's own useDocumentTitle() (a passive effect) wins.
  useLayoutEffect(() => {
    document.title = title ? `${title} – DSBA Hub` : 'DSBA Hub';
  }, [title, pathname]);
  const page =
    modules === false ? (
      <Page />
    ) : (
      <ModulesGate fallback={<PageLoader />} error={(retry, error, retrying) => <CatalogueFailed retry={retry} error={error} retrying={retrying} />}>
        <Page />
      </ModulesGate>
    );
  return (
    <RouteErrorBoundary key={pathname} routeId={id}>
      <Suspense fallback={<PageLoader />}>{gate ? gate(page) : page}</Suspense>
    </RouteErrorBoundary>
  );
}
