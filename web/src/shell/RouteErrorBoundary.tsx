import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, EmptyState, Page, Panel, Icon, glyph } from '../ui';

interface RouteErrorBoundaryProps {
  routeId: string;
  children?: ReactNode;
}

/** Per-route error boundary: one broken feature can't take down the app. Reset by `key` on navigation. */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[DSBA Hub] route "${this.props.routeId}" crashed:`, error, info?.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Page>
        <Panel padding="none">
          <EmptyState
            icon={<Icon glyph={glyph.error} />}
            title="This page didn’t load"
            body="Something went wrong while showing this page. The rest of DSBA Hub still works, so try again or head back home."
            action={
              <>
                <Button
                  variant="primary"
                  leadingIcon={<Icon glyph={glyph.refresh} />}
                  onClick={() => this.setState({ error: null })}
                >
                  Try again
                </Button>
                <Button to="/" leadingIcon={<Icon glyph={glyph.home} />}>
                  Go to Home
                </Button>
              </>
            }
          />
        </Panel>
      </Page>
    );
  }
}
