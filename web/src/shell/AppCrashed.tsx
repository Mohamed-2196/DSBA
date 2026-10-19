import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { Button, EmptyState, HubLogo, Page, Panel, Icon, glyph } from '../ui';
import './AppCrashed.css';

const TITLE_ID = 'app-crashed-title';

/**
 * The router's last line (the app route's errorElement): something outside a page broke, the shell or the account
 * around it. Pages have boundaries of their own (RouteErrorBoundary), so this shows only when the frame itself
 * failed, instead of React Router's screen for developers. It names the tab, takes the keyboard to its heading and
 * offers Home as well as Reload, in case the same thing breaks again.
 */
export function AppCrashed() {
  const error = useRouteError();
  useEffect(() => {
    console.error('[DSBA Hub] the app crashed:', error);
  }, [error]);
  useEffect(() => {
    document.title = 'Something went wrong – DSBA Hub';
    document.getElementById(TITLE_ID)?.focus();
  }, []);
  return (
    <main className="app-crashed">
      <Page width="narrow">
        <div className="app-crashed__logo">
          <HubLogo size={32} />
        </div>
        <Panel padding="none">
          <EmptyState
            icon={<Icon glyph={glyph.error} />}
            title="DSBA Hub hit a problem"
            titleAs="h1"
            titleId={TITLE_ID}
            body="Something went wrong while showing the Hub. Reload the page to carry on, or go to Home if it happens again."
            action={
              <>
                <Button
                  variant="primary"
                  leadingIcon={<Icon glyph={glyph.refresh} />}
                  onClick={() => window.location.reload()}
                >
                  Reload the page
                </Button>
                {/* A plain link, so the whole app loads again. */}
                <Button href={import.meta.env.BASE_URL} variant="ghost" leadingIcon={<Icon glyph={glyph.home} />}>
                  Go to Home
                </Button>
              </>
            }
          />
        </Panel>
      </Page>
    </main>
  );
}
