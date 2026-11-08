// /connect-ai?request=…: an AI app asks to read the Hub as the student (its MCP sign-in); they say yes or no, and go
// back to the app. Signed out, they sign in first and come back here.
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { SwitchedOff, useAuth } from '../../auth';
import { PageLoader } from '../../shell/PageLoader';
import { Badge, Button, EmptyState, Icon, Page, PageHeader, Panel, QueryError, Skeleton, glyph } from '../../ui';
import { useConsentAnswer, useConsentAsk } from './api';
import './aiApps.css';

const TITLE = 'Connect an AI app';
const CAN = [
  'Search the Hub: files, threads, modules, lessons, the newsletter and the calendar',
  'Read the library files you can open, and quote their pages with a link back',
  'See the modules and the tagged past questions',
];
const CANT = ['Post, upload, vote or change anything', 'See your notes, boards, marks or account details'];

function Asking({ request }: { request: string }) {
  const ask = useConsentAsk(request, true);
  const answer = useConsentAnswer();
  const go = (allow: boolean) =>
    answer.mutate({ request, allow }, { onSuccess: (r) => window.location.assign(r.redirectUrl) });

  if (ask.isPending) {
    return (
      <Panel>
        <Skeleton lines={4} />
      </Panel>
    );
  }
  if (ask.isError) {
    return (
      <QueryError
        error={ask.error}
        title="This AI app can’t be connected"
        onRetry={() => void ask.refetch()}
        retrying={ask.isFetching}
      />
    );
  }
  const { appName, redirectHost, alreadyConnected } = ask.data;
  const busy = answer.isPending || answer.isSuccess;
  return (
    <Panel className="aiapps-consent">
      <div className="aiapps-consent__head">
        <span className="aiapps-consent__icon" aria-hidden="true">
          <Icon glyph={glyph.sparkle} />
        </span>
        <div>
          <h2 className="aiapps-consent__title">{appName} wants to read the Hub as you</h2>
          <p className="aiapps-consent__from">
            From <strong>{redirectHost}</strong>
            {alreadyConnected ? (
              <Badge tone="neutral" size="sm">
                Already connected
              </Badge>
            ) : null}
          </p>
        </div>
      </div>
      <div className="aiapps-consent__lists">
        <section aria-labelledby="aiapps-can">
          <h3 id="aiapps-can" className="aiapps-consent__list-title">
            It will be able to
          </h3>
          <ul className="aiapps-consent__list">
            {CAN.map((t) => (
              <li key={t}>
                <Icon glyph={glyph.check} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="aiapps-cant">
          <h3 id="aiapps-cant" className="aiapps-consent__list-title">
            It won’t be able to
          </h3>
          <ul className="aiapps-consent__list aiapps-consent__list--no">
            {CANT.map((t) => (
              <li key={t}>
                <Icon glyph={glyph.close} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="aiapps-consent__note">
        <Icon glyph={glyph.shieldCheck} />
        <span>The Hub doesn’t keep what your AI app asks. Remove the app any time in Your account, under AI apps.</span>
      </p>
      {answer.isError ? (
        <p className="aiapps-consent__error" role="alert">
          {errorMessage(answer.error)}
        </p>
      ) : null}
      <div className="aiapps-consent__actions">
        <Button variant="ghost" onClick={() => go(false)} disabled={busy}>
          Don’t allow
        </Button>
        <Button
          variant="primary"
          onClick={() => go(true)}
          loading={busy && answer.variables?.allow === true}
          disabled={busy}
        >
          Allow
        </Button>
      </div>
    </Panel>
  );
}

export default function ConnectAiPage() {
  const { me, status, openSignIn, featureOn } = useAuth();
  const [params] = useSearchParams();
  const request = params.get('request');

  if (status === 'loading') return <PageLoader />;
  let body;
  if (!request) {
    body = (
      <Panel padding="none">
        <EmptyState
          icon={<Icon glyph={glyph.link} />}
          title="This link isn’t complete"
          body="Start again from your AI app: it sends you here to say yes."
        />
      </Panel>
    );
  } else if (!me) {
    body = (
      <Panel padding="none">
        <EmptyState
          icon={<Icon glyph={glyph.sparkle} />}
          title="Sign in to connect your AI app"
          body="Sign in with your Hub account, then choose whether the app may read the Hub as you."
          action={
            <Button
              variant="primary"
              leadingIcon={<Icon glyph={glyph.signIn} />}
              onClick={() => openSignIn({ reason: 'Sign in to connect your AI app' })}
            >
              Sign in
            </Button>
          }
        />
      </Panel>
    );
  } else if (!featureOn('mcp')) {
    body = <SwitchedOff title={TITLE} />;
  } else {
    body = <Asking request={request} />;
  }
  return (
    <Page width="narrow">
      <PageHeader section="tools" title={TITLE} description="An AI app is asking to read the Hub as you." />
      {body}
    </Page>
  );
}
