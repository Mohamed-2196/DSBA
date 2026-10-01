import { Component } from 'react';
import { ArrowClockwise, House, WarningCircle } from '@phosphor-icons/react';
import { Button, EmptyState, Page, Panel } from '../ui';

/** Per-route error boundary: one broken feature can't take down the app. Reset by `key` on navigation. */
export class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[DSBA Pulse] route "${this.props.routeId}" crashed:`, error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Page>
        <Panel padding="none">
          <EmptyState
            icon={WarningCircle}
            title="This page didn't load"
            body="Something went wrong while showing this page. The rest of DSBA Pulse still works, so try again or head back home."
            action={
              <>
                <Button variant="primary" leadingIcon={ArrowClockwise} onClick={() => this.setState({ error: null })}>Try again</Button>
                <Button to="/" leadingIcon={House}>Go to Home</Button>
              </>
            }
          />
        </Panel>
      </Page>
    );
  }
}
