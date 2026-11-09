// /connect-ai?request=…: an AI app asks to read the Hub as the student (its MCP sign-in); they say yes or no, and go
// back to the app. Signed out, they sign in first and come back here.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { SwitchedOff, useAuth } from '../../auth';
import { PageLoader } from '../../shell/PageLoader';
import { Badge, Button, EmptyState, Icon, Page, PageHeader, Panel, QueryError, Skeleton, glyph } from '../../ui';
import { safeReturn, useConsentAnswer, useConsentAsk } from './api';
import './aiApps.css';

const TITLE = 'Connect an AI app';
const ABOUT = 'Your AI app sends you here to ask whether it may read the Hub as you.';
const NOT_SAFE = 'This app’s return address isn’t one the Hub sends anyone to. Start again from the AI app.';
const CAN = [
  'Search the Hub: files, threads, modules, lessons, the newsletter and the calendar',
  'Read the library files you can open, and quote their pages with a link back',
  'See the modules and the tagged past questions',
];
const CANT = ['Post, upload, vote or change anything', 'See your notes, boards, marks or account details'];

type Ask = ReturnType<typeof useConsentAsk>;

function Asking({ request, ask }: { request: string; ask: Ask }) {
  const answer = useConsentAnswer();
  const [unsafe, setUnsafe] = useState(false);
  const go = (allow: boolean) =>
    answer.mutate(
      { request, allow },
      {
        onSuccess: (r) => {
          if (safeReturn(r.redirectUrl)) window.location.assign(r.redirectUrl);
          else setUnsafe(true);
        },
      },
    );

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
  const busy = answer.isPending || (answer.isSuccess && !unsafe);
  return (
    <Panel className="aiapps-consent">
      <div className="aiapps-consent__head">
        <span className="aiapps-consent__icon" aria-hidden="true">
          <Icon glyph={glyph.key} />
        </span>
        <div className="aiapps-consent__who">
          <h2 className="aiapps-consent__name">{appName}</h2>
          <p className="aiapps-consent__from">
            <span>
              Sends you back to <strong>{redirectHost}</strong>
            </span>
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
      {answer.isError || unsafe ? (
        <p className="aiapps-consent__error" role="alert">
          {unsafe ? NOT_SAFE : errorMessage(answer.error)}
        </p>
      ) : null}
      <div className="aiapps-consent__actions">
        <Button variant="ghost" onClick={() => go(false)} disabled={busy || unsafe}>
          Don’t allow
        </Button>
        <Button
          variant="primary"
          onClick={() => go(true)}
          loading={busy && answer.variables?.allow === true}
          disabled={busy || unsafe}
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
  const asking = !!request && !!me && featureOn('mcp');
  const ask = useConsentAsk(request, asking);

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
          icon={<Icon glyph={glyph.key} />}
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
    body = <Asking request={request} ask={ask} />;
  }
  const app = asking && ask.data ? ask.data.appName : null;
  return (
    <Page width="narrow">
      <PageHeader
        section="tools"
        title={app ? `${app} wants to read the Hub as you` : TITLE}
        description={app ? `Only allow it if you just asked ${app} to connect to the Hub.` : ABOUT}
      />
      {body}
    </Page>
  );
}
