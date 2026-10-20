// Manage → Uploads, for admins: Claude's tagging of each past paper published, with where it stands and why, and
// "Tag again" for one. Claude tags by the module's study guide while the switch "Tag new past papers with Claude" is
// on and the API has a key.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { formatDay } from '../../lib/dates';
import { useToast } from '../../state';
import { Badge, Button, glyph, Icon, Panel, QueryError, Select, Skeleton } from '../../ui';
import { taggingStatus, usePaperTagging, useRunPaperTagging, type TaggingState } from './papers';
import './FlaggedQuestions.css';

const STATES: TaggingState[] = ['queued', 'working', 'done', 'skipped', 'failed'];

function cost(cents: number): string {
  return cents < 1 ? 'under 1¢' : `${Math.round(cents)}¢`;
}

export function PaperTagging() {
  const { isAdmin, featureOn } = useAuth();
  const on = isAdmin && featureOn('library');
  const [status, setStatus] = useState<TaggingState | null>(null);
  const tagging = usePaperTagging(status, { enabled: on });
  const run = useRunPaperTagging();
  const { push } = useToast();
  if (!on) return null;

  const again = (itemId: string, title: string) =>
    run.mutate(itemId, {
      onSuccess: () => push({ tone: 'success', title: `${title} is queued to be tagged again` }),
      onError: (e) => push({ tone: 'alert', title: 'Couldn’t queue the paper', body: errorMessage(e) }),
    });

  const data = tagging.data;
  return (
    <section className="lib-flagged" aria-labelledby="lib-tagging-h" data-hub="paper-tagging">
      <h2 id="lib-tagging-h" className="lib-flagged__h">
        Tagging new past papers
      </h2>
      <p className="lib-flagged__text">
        Claude tags each past paper a rep or admin publishes with its module’s chapters, by the study guide. A student’s
        tag is never replaced.
        {data && !data.on
          ? ' The switch “Tag new past papers with Claude” is off (Access), so papers are skipped.'
          : ''}
        {data && !data.configured ? ' The API has no Anthropic key, so papers are skipped.' : ''}
      </p>
      <Select
        label="Show"
        value={status ?? ''}
        onChange={(e) => setStatus((e.target.value || null) as TaggingState | null)}
      >
        <option value="">Every paper{data ? ` (${STATES.reduce((n, s) => n + (data.counts[s] ?? 0), 0)})` : ''}</option>
        {STATES.map((s) => (
          <option key={s} value={s}>
            {taggingStatus(s).label}
            {data ? ` (${data.counts[s] ?? 0})` : ''}
          </option>
        ))}
      </Select>
      {tagging.isError ? (
        <QueryError
          error={tagging.error}
          title="The tagging list didn’t load"
          onRetry={() => void tagging.refetch()}
          retrying={tagging.isFetching}
          size="sm"
        />
      ) : !data ? (
        <Skeleton width="100%" height="4rem" />
      ) : !data.jobs.length ? (
        <p className="lib-flagged__text">
          {status ? 'No papers here.' : 'No past paper has been published since tagging started.'}
        </p>
      ) : (
        <Panel as="div" padding="none">
          <ul role="list" className="lib-flagged__list">
            {data.jobs.map((job) => {
              const state = taggingStatus(job.status);
              return (
                <li key={job.paper.id} className="lib-flagged__row">
                  <div className="lib-flagged__text">
                    <Badge tone={state.tone} size="sm">
                      {state.label}
                    </Badge>{' '}
                    <Link to={`/library/${encodeURIComponent(job.paper.slug)}`}>{job.paper.title}</Link>
                    <br />
                    {job.status === 'done'
                      ? `${job.questions ?? 0} ${job.questions === 1 ? 'question' : 'questions'} tagged. `
                      : ''}
                    {job.reason ? `${job.reason} ` : ''}
                    Queued {formatDay(new Date(job.queuedAt), { month: 'short' })}
                    {job.costCents > 0 ? `, cost ${cost(job.costCents)}` : ''}.
                  </div>
                  <span className="lib-flagged__acts">
                    <Button
                      size="sm"
                      leadingIcon={<Icon glyph={glyph.refresh} />}
                      onClick={() => again(job.paper.id, job.paper.title)}
                      disabled={job.status === 'working' || job.status === 'queued' || run.isPending}
                    >
                      Tag again
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </section>
  );
}
