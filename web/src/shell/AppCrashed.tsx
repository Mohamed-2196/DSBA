import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import { Button, EmptyState, Page, Panel } from '../ui';

/**
 * The router's last line (the app route's errorElement): something outside a page broke, the shell or the account
 * around it. Pages have boundaries of their own (RouteErrorBoundary), so this shows only when the frame itself
 * failed, instead of React Router's screen for developers.
 */
export function AppCrashed() {
  const error = useRouteError();
  useEffect(() => {
    console.error('[DSBA Hub] the app crashed:', error);
  }, [error]);
  return (
    <Page width="narrow">
      <Panel padding="none">
        <EmptyState
          icon={WarningCircle}
          title="DSBA Hub hit a problem"
          body="Something went wrong while showing the Hub. Reload the page to carry on."
          action={
            <Button variant="primary" leadingIcon={ArrowClockwise} onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          }
        />
      </Panel>
    </Page>
  );
}
