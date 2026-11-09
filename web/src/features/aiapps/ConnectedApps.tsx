// Your account's "AI apps": the apps reading the Hub as you (each removable), and how to add one.
import { errorMessage } from '../../api/errors';
import type { ConnectedApp } from '../../api/types';
import { useCopyLink } from '../../lib/useCopyLink';
import { useToast } from '../../state';
import {
  Button,
  Icon,
  Panel,
  QueryError,
  SectionHeader,
  Skeleton,
  TextField,
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
        <Icon glyph={glyph.key} />
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

/** How to add an app: a lead line (none yet, or another), Claude's steps, and the address with Copy. */
function HowToAdd({ lead }: { lead: string }) {
  const copyLink = useCopyLink();
  const address = mcpAddress();
  return (
    <div className="aiapps-how">
      <p className="aiapps-how__lead">{lead}</p>
      <p className="aiapps-how__text">
        In Claude, open <strong>Settings › Connectors › Add custom connector</strong>, paste this address and sign in
        when it asks.
      </p>
      <TextField
        label="Hub address for AI apps"
        value={address}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        trailing={
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Icon glyph={glyph.copy} />}
            onClick={() => void copyLink(address, 'Paste it into your AI app to connect it to the Hub.')}
          >
            Copy
          </Button>
        }
      />
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
        ) : (
          <>
            {list.length > 0 ? (
              <ul role="list" className="acct-list aiapps-list">
                {list.map((a) => (
                  <AppRow key={a.id} app={a} onRemove={() => onRemove(a)} busy={remove.isPending} />
                ))}
              </ul>
            ) : null}
            <div className="aiapps-more">
              <HowToAdd lead={list.length > 0 ? 'Add another AI app' : 'No AI apps connected yet.'} />
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
