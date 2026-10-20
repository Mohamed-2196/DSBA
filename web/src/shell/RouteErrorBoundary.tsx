import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useOnline } from '../state';
import { Button, EmptyState, Page, Panel, Icon, glyph } from '../ui';
import { codeMissing } from './routeError';

interface RouteErrorBoundaryProps {
  routeId: string;
  children?: ReactNode;
}

/** Per-route error boundary: one broken feature can't take down the app. Reset by `key` on navigation. A page that
 *  failed offline (often one never opened on this device, whose code isn't kept) says the student is offline, not
 *  that something went wrong, and tries again by itself once the connection is back (ST-70). */
export function RouteErrorBoundary(props: RouteErrorBoundaryProps) {
  return <Boundary {...props} online={useOnline()} />;
}

interface BoundaryState {
  error: Error | null;
  /** the browser was offline when it happened */
  offline: boolean;
}

class Boundary extends Component<RouteErrorBoundaryProps & { online: boolean }, BoundaryState> {
  override state: BoundaryState = { error: null, offline: false };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error, offline: typeof navigator !== 'undefined' && navigator.onLine === false };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[DSBA Hub] route "${this.props.routeId}" crashed:`, error, info?.componentStack);
  }

  override componentDidUpdate(before: { online: boolean }) {
    if (!this.state.offline || !this.props.online || before.online) return;
    // Back online: the page tries again, by a reload when its code is what was missing.
    if (codeMissing(this.state.error)) window.location.reload();
    else this.setState({ error: null, offline: false });
  }

  override render() {
    const { error, offline } = this.state;
    if (!error) return this.props.children;
    if (offline)
      return (
        <Page>
          <Panel padding="none">
            <EmptyState
              illustration="offline"
              titleAs="h1"
              title="You’re offline"
              body="This page opens once you’re back online. Pages you’ve opened before on this device, like the library, the forum and your modules, still show what they had."
              action={
                <Button to="/" leadingIcon={<Icon glyph={glyph.home} />}>
                  Go to Home
                </Button>
              }
            />
          </Panel>
        </Page>
      );
    if (codeMissing(error))
      return (
        <Page>
          <Panel padding="none">
            <EmptyState
              icon={<Icon glyph={glyph.error} />}
              titleAs="h1"
              title="This page didn’t load"
              body="Its code couldn’t be fetched. Check your connection, then reload the page."
              action={
                <>
                  <Button
                    variant="primary"
                    leadingIcon={<Icon glyph={glyph.refresh} />}
                    onClick={() => window.location.reload()}
                  >
                    Reload
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
    return (
      <Page>
        <Panel padding="none">
          <EmptyState
            icon={<Icon glyph={glyph.error} />}
            titleAs="h1"
            title="This page didn’t load"
            body="Something went wrong while showing this page. The rest of DSBA Hub still works, so try again or head back home."
            action={
              <>
                <Button
                  variant="primary"
                  leadingIcon={<Icon glyph={glyph.refresh} />}
                  onClick={() => this.setState({ error: null, offline: false })}
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
