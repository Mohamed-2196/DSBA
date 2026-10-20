// A poll in an issue (newsletter.polls): a question to the cohort with two to five answers. Each student votes once
// and sees the counts after voting; nobody sees who voted. A guest is asked to sign in first.
import { useId } from 'react';
import type { PollBlock, PollResult } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { cx, glyph, Icon } from '../../../ui';
import { useVote } from '../api';
import { plainText } from '../lib/text';
import './Poll.css';

/** The issue a poll belongs to, and what it may do there. */
export interface PollIssue {
  issueId: string;
  slug: string;
  polls: Record<string, PollResult> | undefined;
  /** a draft or the editor's preview: the question and answers only */
  readOnly?: boolean;
}

const percent = (n: number, total: number): number => (total ? Math.round((n / total) * 100) : 0);

export function Poll({ block, issue }: { block: PollBlock; issue: PollIssue }) {
  const { featureOn, requireAuth, mayTry } = useAuth();
  const { push } = useToast();
  const vote = useVote();
  const headId = useId();
  if (!featureOn('newsletter.polls')) return null;
  const result = issue.polls?.[block.id];
  const counts = result?.counts ?? null;
  const total = result?.total ?? 0;
  const votes = !issue.readOnly && !block.closed && mayTry('newsletter.react');
  const send = (choice: number) =>
    vote.mutate(
      { issueId: issue.issueId, slug: issue.slug, pollId: block.id, choice },
      {
        onError: (e) =>
          push({ tone: 'alert', title: 'Your vote wasn’t saved', body: errorMessage(e, 'Try again in a moment.') }),
      },
    );
  const choose = (choice: number) => {
    if (requireAuth('Sign in to vote', () => send(choice))) send(choice);
  };
  return (
    <section className="nl-poll" aria-labelledby={headId} data-hub="poll" data-poll-id={block.id}>
      <p className="nl-poll__kicker">
        <Icon glyph={glyph.chartBar} aria-hidden="true" />
        Poll
      </p>
      <h3 id={headId} className="nl-poll__question">
        {plainText(block.question)}
      </h3>
      {counts ? (
        <ul className="nl-poll__results" role="list">
          {block.answers.map((answer, i) => {
            const n = counts[i] ?? 0;
            const share = percent(n, total);
            return (
              <li key={`${i}-${answer}`} className={cx('nl-poll__result', result?.mine === i && 'is-mine')}>
                <span className="nl-poll__bar" style={{ inlineSize: `${share}%` }} aria-hidden="true" />
                <span className="nl-poll__answer">
                  {answer}
                  {result?.mine === i ? <span className="nl-poll__you"> (your vote)</span> : null}
                </span>
                <span className="nl-poll__share">
                  {share}%
                  <span className="visually-hidden">
                    , {n} {n === 1 ? 'vote' : 'votes'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="nl-poll__answers" role="group" aria-labelledby={headId}>
          {block.answers.map((answer, i) => (
            <button
              key={`${i}-${answer}`}
              type="button"
              className="nl-poll__choice"
              disabled={!votes || vote.isPending}
              onClick={() => choose(i)}
            >
              {answer}
            </button>
          ))}
        </div>
      )}
      <p className="nl-poll__foot">
        {total === 1 ? '1 vote' : `${total} votes`}
        {block.closed
          ? '. This poll is closed.'
          : counts
            ? '. Nobody sees who voted.'
            : votes
              ? '. You’ll see the results once you vote.'
              : issue.readOnly
                ? ''
                : '. Voting isn’t on your account.'}
      </p>
    </section>
  );
}
