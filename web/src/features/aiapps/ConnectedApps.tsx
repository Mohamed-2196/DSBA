// Your account's "AI apps": the apps reading the Hub as you (each removable), and how to add one.
import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { ConnectedApp } from '../../api/types';
import { copyText } from '../../lib/share';
import { useToast } from '../../state';
import {
  Button,
  EmptyState,
  Icon,
  Panel,
  QueryError,
  SectionHeader,
  Skeleton,
  formatDate,
  glyph,
  timeAgo,
} from '../../ui';
import { mcpAddress, useConnectedApps, useDisconnectApp } from './api';
import './aiApps.css';

function AppRow({ app, onRemove, busy }: { app: ConnectedApp; onRemove: () => void; busy: boolean }) {
  const used = app.lastUsedAt ? `Used ${timeAgo(app.lastUsedAt)}` : 'Not used yet';
  return (
    <li className="acct-row">
      <span className="acct-row__icon" aria-hidden="true">
        <Icon glyph={glyph.sparkle} />
      </span>
      <span className="acct-row__text">
        <span className="acct-row__label">{app.appName}</span>
        <span className="acct-row__value">
          {app.redirectHost}
          <span aria-hidden="true"> · </span>
          <span className="visually-hidden">, </span>
          {used}
          <span aria-hidden="true"> · </span>
          <span className="visually-hidden">, </span>
          connected {formatDate(app.connectedAt)}
        </span>
      </span>
      <span className="acct-row__actions">
        <Button size="sm" variant="ghost" onClick={onRemove} disabled={busy} aria-label={`Remove ${app.appName}`}>
          Remove
        </Button>
      </span>
    </li>
  );
}

function HowToAdd() {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);
  const address = mcpAddress();
  const copy = async () => {
    const ok = await copyText(address);
    setCopied(ok);
    push(
      ok
        ? { tone: 'success', title: 'Address copied' }
        : { tone: 'alert', title: 'Couldn’t copy. Select it and copy it instead.' },
    );
  };
  return (
    <div className="aiapps-how">
      <p className="aiapps-how__text">
        In Claude, open <strong>Settings › Connectors › Add custom connector</strong>, paste this address and sign in
        when it asks.
      </p>
      <div className="aiapps-how__address">
        <code className="aiapps-how__url">{address}</code>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Icon glyph={copied ? glyph.check : glyph.copy} />}
          onClick={() => void copy()}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

export function ConnectedApps() {
  const { push } = useToast();
  const apps = useConnectedApps(true);
  const remove = useDisconnectApp();
  const list = apps.data ?? [];

  const onRemove = (app: ConnectedApp) =>
    remove.mutate(app.id, {
      onSuccess: () => push({ tone: 'success', title: `${app.appName} can’t read the Hub any more` }),
      onError: (err) => push({ tone: 'alert', title: 'Couldn’t remove that app', body: errorMessage(err) }),
    });

  return (
    <>
      <SectionHeader
        id="acct-ai-apps"
        title="AI apps"
        description="Let an AI app like Claude search the Hub and quote its files for you. It reads what you can read, and can’t post or change anything."
      />
      <Panel padding="none">
        {apps.isPending ? (
          <ul role="list" className="acct-list" aria-busy="true" aria-label="Loading AI apps">
            <li className="acct-row">
              <Skeleton width={36} height={36} radius="var(--r-control)" />
              <Skeleton lines={2} className="acct-row__text" />
            </li>
          </ul>
        ) : apps.isError ? (
          <QueryError
            error={apps.error}
            title="Your AI apps didn’t load"
            onRetry={() => void apps.refetch()}
            retrying={apps.isFetching}
            size="sm"
            panel={false}
          />
        ) : list.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Icon glyph={glyph.sparkle} />}
            title="No AI apps connected"
            body={<HowToAdd />}
          />
        ) : (
          <>
            <ul role="list" className="acct-list">
              {list.map((a) => (
                <AppRow key={a.id} app={a} onRemove={() => onRemove(a)} busy={remove.isPending} />
              ))}
            </ul>
            <div className="aiapps-more">
              <HowToAdd />
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
