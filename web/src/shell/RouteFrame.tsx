import { Suspense, useLayoutEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SwitchedOff, useAuth, type Feature } from '../auth';
import { ModulesGate } from '../state/ModulesProvider';
import { Badge, Page as PageFrame, QueryError } from '../ui';
import type { LazyPage } from './lazyPage';
import { PageLoader } from './PageLoader';
import { RouteErrorBoundary } from './RouteErrorBoundary';

/** A page of the app (routes.tsx). */
export interface AppRoute {
  id: string;
  path: string;
  title: string | null;
  Page: LazyPage;
  /** false: the page doesn't use the module catalogue, so it shows even when the catalogue can't be loaded */
  modules?: false;
  /** who may open it (the style guide is a tool for the team, not a page for students) */
  gate?: (page: ReactNode) => ReactNode;
  /** the feature the page belongs to: off for this person, the page says so */
  feature?: Feature;
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
  const { id, title, Page, modules, gate, feature } = route;
  const { status, featureOn, offForOthers } = useAuth();
  // Default tab title. A layout effect, so a page's own useDocumentTitle() (a passive effect) wins.
  useLayoutEffect(() => {
    document.title = title ? `${title} – DSBA Hub` : 'DSBA Hub';
  }, [title, pathname]);
  if (feature && status !== 'loading' && !featureOn(feature)) {
    return <SwitchedOff title={title ?? 'DSBA Hub'} />;
  }
  // An admin opens every page; this marks one that people without Admin can't open right now.
  const marker =
    feature && offForOthers(feature) ? (
      <p className="route-off-for-others">
        <Badge tone="alert" size="sm">
          Off for others
        </Badge>
      </p>
    ) : null;
  const page =
    modules === false ? (
      <Page />
    ) : (
      <ModulesGate
        fallback={<PageLoader />}
        error={(retry, error, retrying) => <CatalogueFailed retry={retry} error={error} retrying={retrying} />}
      >
        <Page />
      </ModulesGate>
    );
  return (
    <RouteErrorBoundary key={pathname} routeId={id}>
      <Suspense fallback={<PageLoader />}>
        {marker}
        {gate ? gate(page) : page}
      </Suspense>
    </RouteErrorBoundary>
  );
}
